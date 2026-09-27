import {beforeEach, describe, expect, mock, test} from 'bun:test'

// The secretsmanager router imports the `secretsManager` singleton directly from
// `../aws`, so we replace that module with a stub whose `send()` is driven per
// test. `responder` returns the fake AWS SDK response and `lastCommand` captures
// the command that was dispatched so we can assert on its input shape.
let lastCommand: {constructor: {name: string}; input: Record<string, unknown>} | null = null
let responder: (commandName: string, command: {input: Record<string, unknown>}) => unknown

mock.module('../aws', () => ({
    secretsManager: {
        async send(command: {constructor: {name: string}; input: Record<string, unknown>}) {
            lastCommand = command
            return responder(command.constructor.name, command)
        },
    },
}))

// Imported after the mock is registered so the route binds to the stubbed client.
const {default: app} = await import('./secretsmanager')

beforeEach(() => {
    lastCommand = null
    responder = () => ({})
})

describe('GET /secrets', () => {
    test('follows NextToken pagination and maps each entry', async () => {
        const pages = [
            {
                SecretList: [{Name: 'a', ARN: 'arn:a', Tags: [{Key: 'env', Value: 'prod'}]}],
                NextToken: 'page2',
            },
            {SecretList: [{Name: 'b', ARN: 'arn:b'}], NextToken: undefined},
        ]
        let call = 0
        responder = () => pages[call++]

        const res = await app.request('/secrets')
        expect(res.status).toBe(200)
        const body = await res.json()

        // Both pages are merged, proving the do/while followed NextToken.
        expect(call).toBe(2)
        expect(body).toHaveLength(2)
        expect(body[0]).toMatchObject({
            name: 'a',
            arn: 'arn:a',
            rotationEnabled: false,
            tags: [{key: 'env', value: 'prod'}],
        })
        expect(body[1]).toMatchObject({name: 'b', arn: 'arn:b', tags: []})
    })
})

describe('GET /secret', () => {
    test('derives versionIds from VersionIdsToStages and maps tags', async () => {
        responder = () => ({
            Name: 'svc',
            ARN: 'arn:svc',
            Description: 'desc',
            VersionIdsToStages: {v1: ['AWSCURRENT'], v2: ['AWSPREVIOUS']},
            Tags: [{Key: 'team', Value: 'core'}],
        })

        const res = await app.request('/secret?id=svc')
        expect(res.status).toBe(200)
        const body = await res.json()

        expect(body.versionIds).toEqual(['v1', 'v2'])
        expect(body.tags).toEqual([{key: 'team', value: 'core'}])
        expect(lastCommand?.input.SecretId).toBe('svc')
    })

    test('returns 400 when id is missing and never calls AWS', async () => {
        const res = await app.request('/secret')
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })
})

describe('GET /secret/value', () => {
    test('returns SecretString verbatim', async () => {
        responder = () => ({Name: 's', VersionId: 'v1', SecretString: '{"k":"v"}'})

        const res = await app.request('/secret/value?id=s')
        const body = await res.json()

        expect(body.secretString).toBe('{"k":"v"}')
        expect(body.secretBinary).toBeUndefined()
        expect(body.versionId).toBe('v1')
    })

    test('encodes SecretBinary as base64', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4])
        responder = () => ({Name: 's', SecretBinary: bytes})

        const res = await app.request('/secret/value?id=s')
        const body = await res.json()

        expect(body.secretString).toBeUndefined()
        expect(body.secretBinary).toBe(Buffer.from(bytes).toString('base64'))
    })

    test('marks the plaintext response as no-store', async () => {
        responder = () => ({Name: 's', SecretString: 'plain'})

        const res = await app.request('/secret/value?id=s')
        expect(res.status).toBe(200)
        expect(res.headers.get('cache-control')).toBe('no-store')
    })

    test('returns 400 when id is missing and never calls AWS', async () => {
        const res = await app.request('/secret/value')
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })
})

describe('POST /secrets', () => {
    test('passes the create input through and echoes the result', async () => {
        responder = (_name, command) => ({Name: command.input.Name, ARN: 'arn:new', VersionId: 'v1'})

        const res = await app.request('/secrets', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({name: 'newSecret', secretString: 'val', description: 'd'}),
        })
        const body = await res.json()

        expect(lastCommand?.input).toMatchObject({Name: 'newSecret', SecretString: 'val', Description: 'd'})
        expect(body).toMatchObject({name: 'newSecret', arn: 'arn:new', versionId: 'v1'})
    })

    test('returns 400 when name is missing and never calls AWS', async () => {
        const res = await app.request('/secrets', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({secretString: 'val'}),
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })

    test('returns 400 when secretString is missing and never calls AWS', async () => {
        const res = await app.request('/secrets', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({name: 'newSecret'}),
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })

    test('returns 400 on an invalid JSON body and never calls AWS', async () => {
        const res = await app.request('/secrets', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: 'not json',
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })
})

describe('PUT /secret/value', () => {
    test('writes a new SecretString version', async () => {
        responder = () => ({ARN: 'arn:x', VersionId: 'v2'})

        const res = await app.request('/secret/value', {
            method: 'PUT',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({id: 'x', secretString: 'updated'}),
        })
        const body = await res.json()

        expect(lastCommand?.input).toMatchObject({SecretId: 'x', SecretString: 'updated'})
        expect(body).toMatchObject({arn: 'arn:x', versionId: 'v2'})
    })

    test('returns 400 when id is missing and never calls AWS', async () => {
        const res = await app.request('/secret/value', {
            method: 'PUT',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({secretString: 'updated'}),
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })
})

describe('DELETE /secret', () => {
    test('uses the 7-day recovery window by default', async () => {
        await app.request('/secret?id=x', {method: 'DELETE'})

        expect(lastCommand?.input.RecoveryWindowInDays).toBe(7)
        expect(lastCommand?.input.ForceDeleteWithoutRecovery).toBeUndefined()
    })

    test('force deletes without recovery when force=true', async () => {
        await app.request('/secret?id=x&force=true', {method: 'DELETE'})

        expect(lastCommand?.input.ForceDeleteWithoutRecovery).toBe(true)
        expect(lastCommand?.input.RecoveryWindowInDays).toBeUndefined()
    })

    test('returns 400 when id is missing and never calls AWS', async () => {
        const res = await app.request('/secret', {method: 'DELETE'})
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })

    test('returns 400 when secretString is missing and never calls AWS', async () => {
        const res = await app.request('/secret/value', {
            method: 'PUT',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({id: 'x'}),
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })

    test('returns 400 on an invalid JSON body and never calls AWS', async () => {
        const res = await app.request('/secret/value', {
            method: 'PUT',
            headers: {'content-type': 'application/json'},
            body: 'not json',
        })
        expect(res.status).toBe(400)
        expect(lastCommand).toBeNull()
    })
})
