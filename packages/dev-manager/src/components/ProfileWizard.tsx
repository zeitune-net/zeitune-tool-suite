import { useEffect } from 'react'
import { useDevManagerStore } from '../store'
import { CreateWizard } from './wizard/CreateWizard'
import { EditWizard } from './wizard/EditWizard'

export function ProfileWizard() {
  const { wizardOpen, setWizardOpen, editingProfileId, profiles } = useDevManagerStore()

  const editingProfile = editingProfileId
    ? profiles.find((p) => p.id === editingProfileId)
    : null

  const close = () => {
    setWizardOpen(false)
    useDevManagerStore.setState({ editingProfileId: null })
  }

  useEffect(() => {
    if (!wizardOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen])

  if (!wizardOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {editingProfile ? (
        <EditWizard profile={editingProfile} onClose={close} />
      ) : (
        <CreateWizard onClose={close} />
      )}
    </div>
  )
}
