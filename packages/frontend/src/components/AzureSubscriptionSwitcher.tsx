import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Check, ChevronDown, Layers3} from 'lucide-react'
import {
    DEFAULT_AZURE_SUBSCRIPTION_ID,
    isAzureSubscriptionId,
    setAzureSubscriptionId,
    useAzureSubscriptionId,
    useAzureSubscriptionRecents,
} from '@/lib/azureSubscriptionStore'

function shortId(id: string): string {
    return `${id.slice(0, 8)}…${id.slice(-4)}`
}

export function AzureSubscriptionSwitcher() {
    const subscriptionId = useAzureSubscriptionId()
    const recents = useAzureSubscriptionRecents()
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onClick = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    async function applySubscription(id: string) {
        if (!isAzureSubscriptionId(id)) {
            setError('Subscription ID must be a UUID.')
            return
        }
        await queryClient.cancelQueries()
        setAzureSubscriptionId(id)
        queryClient.clear()
        setDraft('')
        setError(null)
        setOpen(false)
    }

    return (
        <div className="account-switcher" ref={containerRef}>
            <button
                type="button"
                className="account-trigger"
                onClick={() => setOpen((value) => !value)}
                title={`Switch Azure subscription (${subscriptionId})`}
                aria-label={`Switch Azure subscription ${subscriptionId}`}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <Layers3 size={14}/>
                <span className="account-meta">
                    <span className="account-label">Subscription</span>
                    <span className="account-value">{shortId(subscriptionId)}</span>
                </span>
                <ChevronDown size={14}/>
            </button>

            {open && (
                <div className="account-popover" role="listbox">
                    <div className="account-popover-title">Switch Azure subscription</div>
                    <p className="account-context-note">Azure resources are separate for each subscription. Service Bus namespace names are globally unique.</p>
                    <div className="account-recents">
                        {recents.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className={`account-option${id === subscriptionId ? ' active' : ''}`}
                                role="option"
                                aria-selected={id === subscriptionId}
                                title={id}
                                onClick={() => void applySubscription(id)}
                            >
                                <span className="account-option-id">{shortId(id)}</span>
                                {id === DEFAULT_AZURE_SUBSCRIPTION_ID && <span className="account-tag">default</span>}
                                {id === subscriptionId && <Check size={13}/>}
                            </button>
                        ))}
                    </div>
                    <form
                        className="account-entry"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void applySubscription(draft.trim())
                        }}
                    >
                        <input
                            value={draft}
                            maxLength={36}
                            placeholder="Subscription UUID"
                            aria-label="Azure subscription ID"
                            onChange={(event) => {
                                setDraft(event.target.value)
                                setError(null)
                            }}
                        />
                        <button type="submit" disabled={!isAzureSubscriptionId(draft.trim())}>
                            Switch
                        </button>
                    </form>
                    {error && <div className="account-error">{error}</div>}
                </div>
            )}
        </div>
    )
}
