import {useState} from 'react'
import {FileJson, Loader2, Upload} from 'lucide-react'
import {useQueryClient} from '@tanstack/react-query'
import {createCloudResource} from '@/api/cloudProxyClient'

interface AzureAppConfigurationImportPanelProps {
    runtimeReachable: boolean
}

interface ImportFailure {
    key: string
    message: string
}

interface ImportResult {
    imported: number
    failures: ImportFailure[]
}

export function AzureAppConfigurationImportPanel({runtimeReachable}: AzureAppConfigurationImportPanelProps) {
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [label, setLabel] = useState('')
    const [isImporting, setIsImporting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ImportResult | null>(null)

    async function importFile() {
        if (!file) return

        setIsImporting(true)
        setError(null)
        setResult(null)

        try {
            const entries = parseFlattenedConfiguration(await file.text())
            const failures: ImportFailure[] = []
            let imported = 0
            const selectedLabel = label.trim() || null

            // Intentionally sequential: a configuration file can contain many keys,
            // and the local runtime should not receive an unbounded request burst.
            for (const [key, value] of entries) {
                try {
                    await createCloudResource('azure', 'configuration', {
                        key,
                        value,
                        label: selectedLabel,
                    })
                    imported += 1
                } catch (entryError) {
                    failures.push({key, message: errorMessage(entryError)})
                }
            }

            setResult({imported, failures})
            await queryClient.invalidateQueries({
                queryKey: ['cloud-resources', 'azure', 'configuration'],
            })
        } catch (importError) {
            setError(errorMessage(importError))
        } finally {
            setIsImporting(false)
        }
    }

    return (
        <section className="appconfig-import-panel" aria-labelledby="appconfig-import-title">
            <div className="appconfig-import-heading">
                <div>
                    <p className="eyebrow">Bulk operation</p>
                    <h3 id="appconfig-import-title">Import JSON</h3>
                    <p className="muted">Import an already-flattened JSON object as App Configuration key-values.</p>
                </div>
                <FileJson size={20} aria-hidden="true"/>
            </div>
            <div className="appconfig-import-controls">
                <label className="appconfig-import-field">
                    <span>JSON file</span>
                    <input
                        className="input appconfig-file-input"
                        type="file"
                        accept=".json,application/json"
                        disabled={isImporting}
                        onChange={(event) => {
                            setFile(event.target.files?.[0] ?? null)
                            setError(null)
                            setResult(null)
                        }}
                    />
                </label>
                <label className="appconfig-import-field">
                    <span>Label <small>(optional)</small></span>
                    <input
                        className="input"
                        type="text"
                        value={label}
                        disabled={isImporting}
                        placeholder="No label"
                        onChange={(event) => {
                            setLabel(event.target.value)
                            setResult(null)
                        }}
                    />
                </label>
                <button
                    className="button primary"
                    type="button"
                    disabled={!file || !runtimeReachable || isImporting}
                    onClick={() => void importFile()}
                >
                    {isImporting ? <Loader2 className="spin" size={14}/> : <Upload size={14}/>}
                    {isImporting ? 'Importing' : 'Import'}
                </button>
            </div>
            {!runtimeReachable && (
                <p className="muted appconfig-import-message">The Azure runtime must be reachable before importing.</p>
            )}
            {error && <div className="form-error appconfig-import-message" role="alert">{error}</div>}
            {result && (
                <div className="appconfig-import-result" role="status">
                    <p>
                        Imported {result.imported} {result.imported === 1 ? 'setting' : 'settings'}.
                        {' '}{result.failures.length} {result.failures.length === 1 ? 'setting' : 'settings'} failed.
                    </p>
                    {result.failures.length > 0 && (
                        <ul>
                            {result.failures.map((failure) => (
                                <li key={failure.key}><code>{failure.key}</code>: {failure.message}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    )
}

function parseFlattenedConfiguration(json: string): Array<[string, string]> {
    let parsed: unknown
    try {
        parsed = JSON.parse(json)
    } catch {
        throw new Error('The selected file is not valid JSON.')
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('The JSON file must contain a top-level object.')
    }

    const invalidKeys: string[] = []
    const entries = Object.entries(parsed).map(([key, value]): [string, string] => {
        if (typeof value === 'object' && value !== null) {
            invalidKeys.push(key)
            return [key, '']
        }
        if (value === null) return [key, '']
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return [key, String(value)]
        }
        invalidKeys.push(key)
        return [key, '']
    })

    if (invalidKeys.length > 0) {
        const keys = invalidKeys.map((key) => `"${key}"`).join(', ')
        throw new Error(`Nested objects and arrays are not supported. Invalid ${invalidKeys.length === 1 ? 'key' : 'keys'}: ${keys}.`)
    }

    return entries
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Import failed.'
}
