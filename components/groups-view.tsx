"use client"

import { useMemo, useState } from "react"
import {
  Plus,
  ChevronRight,
  Users,
  MapPin,
  Shield,
  Settings,
  Bell,
  UserPlus,
  CheckCircle2,
  LogOut,
  Trash2,
  Pencil,
  RefreshCcw,
  Ban,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useApp, type Geofence, type Group } from "./app-provider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CreateGroupModal } from "./modals/create-group-modal"
import { GroupSettingsModal } from "./modals/group-settings-modal"
import { InviteMemberModal } from "./modals/invite-member-modal"
import { GeofenceFormModal } from "./modals/geofence-form-modal"

export function GroupsView() {
  const {
    groups,
    geofences,
    groupInvitations,
    groupActivity,
    user,
    createGroup,
    updateGroup,
    inviteToGroup,
    respondToInvitation,
    joinGroup,
    leaveGroup,
    createGeofence,
    updateGeofence,
    deleteGeofence,
    toggleGeofenceAlerts,
    resendGroupInvitation,
    withdrawGroupInvitation,
  } = useApp()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [settingsModalGroup, setSettingsModalGroup] = useState<Group | null>(null)
  const [inviteModalGroup, setInviteModalGroup] = useState<Group | null>(null)
  const [geofenceModalState, setGeofenceModalState] = useState<{
    mode: "create" | "edit"
    groupId?: string | null
    geofence?: Geofence | null
  } | null>(null)
  const [incomingInvitationActionId, setIncomingInvitationActionId] = useState<string | null>(null)
  const [outgoingInvitationActionId, setOutgoingInvitationActionId] = useState<string | null>(null)
  const [geofenceActionId, setGeofenceActionId] = useState<string | null>(null)
  const [deleteGeofenceConfirm, setDeleteGeofenceConfirm] = useState<Geofence | null>(null)

  const filteredGeofences = useMemo(() => {
    return selectedGroup ? geofences.filter((item) => item.groupId === selectedGroup) : geofences
  }, [geofences, selectedGroup])

  const filteredActivity = useMemo(() => {
    return selectedGroup ? groupActivity.filter((item) => item.groupId === selectedGroup) : groupActivity
  }, [groupActivity, selectedGroup])

  const pendingInvitations = useMemo(() => {
    return groupInvitations.filter((invite) => invite.status === "pending")
  }, [groupInvitations])
  const groupOutgoingInvites = useMemo(() => {
    return groupInvitations.filter((invite) => invite.groupId === selectedGroup)
  }, [groupInvitations, selectedGroup])

  const handleCreateGroupSubmit = async (payload: { name: string; description?: string }) => {
    try {
      await createGroup(payload.name, payload.description)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the group. Please try again."
      toast.error(message)
      throw error
    }
  }

  const handleUpdateGroupSubmit = async (groupId: string, updates: { name?: string; description?: string }) => {
    try {
      await updateGroup(groupId, updates)
      setSettingsModalGroup(null)
      toast.success("Group updated successfully")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update the group. Please try again."
      toast.error(message)
      throw error
    }
  }

  const handleInviteSubmit = async (params: { email: string; role: "member" | "admin" }) => {
    if (!inviteModalGroup) return
    try {
      await inviteToGroup(inviteModalGroup.id, params.email, params.role)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send the invitation. Please try again."
      toast.error(message)
      throw error
    }
  }

  const handleGroupMembership = async (group: Group) => {
    const isMember = group.members.some((member) => member.id === user?.id)
    setIsSubmitting(true)
    try {
      if (isMember) {
        await leaveGroup(group.id)
      } else {
        await joinGroup(group.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update group membership. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGeofenceSubmit = async (payload: {
    name: string
    latitude: number
    longitude: number
    radiusMeters: number
    description?: string
  }) => {
    if (!geofenceModalState) return
    try {
      if (geofenceModalState.mode === "edit" && geofenceModalState.geofence) {
        await updateGeofence(geofenceModalState.geofence.id, payload)
      } else {
        await createGeofence({
          ...payload,
          groupId: geofenceModalState.groupId ?? undefined,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the geofence. Please try again."
      toast.error(message)
      throw error
    }
  }

  const handleInvitationResponse = async (invitationId: string, decision: "accept" | "decline") => {
    setIncomingInvitationActionId(invitationId)
    try {
      await respondToInvitation(invitationId, decision)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update the invitation. Please try again."
      toast.error(message)
    } finally {
      setIncomingInvitationActionId(null)
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    setOutgoingInvitationActionId(invitationId)
    try {
      await resendGroupInvitation(invitationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not resend the invite. Please try again."
      toast.error(message)
    } finally {
      setOutgoingInvitationActionId(null)
    }
  }

  const handleWithdrawInvitation = async (invitationId: string) => {
    setOutgoingInvitationActionId(invitationId)
    try {
      await withdrawGroupInvitation(invitationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not withdraw the invite. Please try again."
      toast.error(message)
    } finally {
      setOutgoingInvitationActionId(null)
    }
  }

  const handleToggleGeofenceAlerts = async (geofenceId: string, enabled: boolean) => {
    setGeofenceActionId(geofenceId)
    try {
      await toggleGeofenceAlerts(geofenceId, enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update alerts. Please try again."
      toast.error(message)
    } finally {
      setGeofenceActionId(null)
    }
  }

  const confirmDeleteGeofence = async () => {
    if (!deleteGeofenceConfirm) return
    setGeofenceActionId(deleteGeofenceConfirm.id)
    try {
      await deleteGeofence(deleteGeofenceConfirm.id)
      setDeleteGeofenceConfirm(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove the geofence. Please try again."
      toast.error(message)
      throw error
    } finally {
      setGeofenceActionId(null)
    }
  }

  const selectedGroupDetails = groups.find((group) => group.id === selectedGroup) ?? null

  return (
    <>
      <CreateGroupModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateGroupSubmit}
      />
      <GroupSettingsModal
        isOpen={!!settingsModalGroup}
        onClose={() => setSettingsModalGroup(null)}
        group={settingsModalGroup}
        onSubmit={handleUpdateGroupSubmit}
      />
      <InviteMemberModal
        isOpen={Boolean(inviteModalGroup)}
        groupName={inviteModalGroup?.name}
        onClose={() => setInviteModalGroup(null)}
        onSubmit={handleInviteSubmit}
      />
      <GeofenceFormModal
        isOpen={Boolean(geofenceModalState)}
        mode={geofenceModalState?.mode ?? "create"}
        groupName={
          geofenceModalState?.geofence?.groupId
            ? groups.find((group) => group.id === geofenceModalState.geofence?.groupId)?.name
            : selectedGroupDetails?.name
        }
        initialValues={
          geofenceModalState?.geofence
            ? {
                id: geofenceModalState.geofence.id,
                name: geofenceModalState.geofence.name,
                latitude: geofenceModalState.geofence.latitude,
                longitude: geofenceModalState.geofence.longitude,
                radiusMeters: geofenceModalState.geofence.radiusMeters,
                description: geofenceModalState.geofence.description,
              }
            : undefined
        }
        onClose={() => setGeofenceModalState(null)}
        onSubmit={handleGeofenceSubmit}
      />

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Groups</h1>
            <Button className="gap-2" onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Group
            </Button>
          </div>

          {/* My Groups */}
          <div className="space-y-3">
          {groups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Groups Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a group to collaborate with other hunters and share locations
                </p>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Group
                </Button>
              </CardContent>
            </Card>
          ) : (
            groups.map((group) => {
            const isMember = group.members.some((member) => member.id === user?.id)
            const isOwner = group.role === "owner"

            return (
              <Card
                key={group.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  selectedGroup === group.id ? "ring-2 ring-primary" : "hover:bg-muted/50",
                )}
                onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {group.name}
                          <span
                            className={cn(
                              "text-xs px-2 py-1 rounded-full capitalize",
                              group.role === "owner" && "bg-accent/20 text-accent",
                              group.role === "admin" && "bg-primary/10 text-primary",
                              group.role === "member" && "bg-muted text-muted-foreground",
                            )}
                          >
                            {group.role}
                          </span>
                        </h3>
                        <p className="text-sm text-muted-foreground">{group.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex -space-x-2">
                            {group.members.slice(0, 3).map((member) => (
                              <div
                                key={member.id}
                                className="w-6 h-6 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[10px] font-medium"
                              >
                                {member.name.charAt(0)}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{group.members.length} members</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform",
                        selectedGroup === group.id && "rotate-90",
                      )}
                    />
                  </div>

                  {selectedGroup === group.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {/* Members */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold">Members</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(event) => {
                              event.stopPropagation()
                              setInviteModalGroup(group)
                            }}
                          >
                            <UserPlus className="w-3 h-3 mr-1" />
                            Invite
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {group.members.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                            >
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-medium">
                                    {member.name.charAt(0)}
                                  </div>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-safe border border-card" />
                                </div>
                                <span className="text-sm font-medium">{member.name}</span>
                              </div>
                              <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-full",
                                  member.role === "owner" && "bg-accent/20 text-accent",
                                  member.role === "admin" && "bg-primary/20 text-primary",
                                  member.role === "member" && "bg-muted text-muted-foreground",
                                )}
                              >
                                {member.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {groupOutgoingInvites.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold">Invitations</h4>
                          </div>
                          <div className="space-y-2">
                            {groupOutgoingInvites.map((invite) => {
                              const isProcessing = outgoingInvitationActionId === invite.id

                              return (
                                <div
                                  key={invite.id}
                                  className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/40"
                                >
                                  <div>
                                    <p className="text-sm font-medium">
                                      {invite.recipientEmail || "Pending recipient"}
                                    </p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                      {invite.role} • {invite.status}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleResendInvitation(invite.id)
                                      }}
                                      disabled={isProcessing || invite.status !== "pending"}
                                      title="Resend invitation"
                                      aria-label="Resend invitation"
                                    >
                                      {isProcessing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <RefreshCcw className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleWithdrawInvitation(invite.id)
                                      }}
                                      disabled={isProcessing || invite.status !== "pending"}
                                      title="Withdraw invitation"
                                      aria-label="Withdraw invitation"
                                    >
                                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleGroupMembership(group)
                          }}
                          disabled={isSubmitting || (isOwner && isMember)}
                        >
                          {isMember ? (
                            <>
                              <LogOut className="w-4 h-4 mr-1" />
                              Leave
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4 mr-1" />
                              Join
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          onClick={(event) => {
                            event.stopPropagation()
                            setGeofenceModalState({ mode: "create", groupId: group.id, geofence: null })
                          }}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Add Geofence
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 bg-transparent"
                          disabled={!isOwner}
                          title={isOwner ? "Group settings" : "Only the owner can edit group settings"}
                          onClick={(event) => {
                            event.stopPropagation()
                            setSettingsModalGroup(group)
                          }}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          }))}
        </div>

        {/* Group Activity Feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          <Card>
            <CardContent className={cn(filteredActivity.length === 0 ? "p-8 text-center" : "p-0 divide-y divide-border")}>
              {filteredActivity.length === 0 ? (
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                    <Bell className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                filteredActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-4">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      activity.type === "waypoint" && "bg-accent/20",
                      activity.type === "join" && "bg-safe/20",
                      activity.type === "geofence" && "bg-primary/20",
                      activity.type === "invite" && "bg-muted",
                    )}
                  >
                    {activity.type === "waypoint" && <MapPin className="w-4 h-4 text-accent" />}
                    {activity.type === "join" && <CheckCircle2 className="w-4 h-4 text-safe" />}
                    {activity.type === "geofence" && <Shield className="w-4 h-4 text-primary" />}
                    {activity.type === "invite" && <UserPlus className="w-4 h-4 text-muted-foreground" />}
                    {activity.type === "alert" && <Bell className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.actorName}</span>
                      <span className="text-muted-foreground"> {activity.description}</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {activity.createdAt.toLocaleTimeString()}
                  </span>
                </div>
              )))}
            </CardContent>
          </Card>
        </div>

        {/* Geofences */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Geofences</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setGeofenceModalState({ mode: "create", groupId: selectedGroup, geofence: null })
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {filteredGeofences.map((geofence) => {
              const isProcessing = geofenceActionId === geofence.id
              return (
                <Card key={geofence.id}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/20">
                        <Shield className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{geofence.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {geofence.notifyOnEntry || geofence.notifyOnExit
                            ? `${geofence.notifyOnEntry ? "Entry" : ""}${
                                geofence.notifyOnEntry && geofence.notifyOnExit ? " & " : ""
                              }${geofence.notifyOnExit ? "Exit" : ""} alerts`
                            : "No alerts"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {geofence.latitude.toFixed(4)}, {geofence.longitude.toFixed(4)} • {geofence.radiusMeters}m
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={geofence.enabled ? "outline" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleGeofenceAlerts(geofence.id, !geofence.enabled)}
                        disabled={isProcessing}
                        title={geofence.enabled ? "Disable geofence alerts" : "Enable geofence alerts"}
                        aria-label={geofence.enabled ? "Disable geofence alerts" : "Enable geofence alerts"}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Bell className={cn("w-4 h-4", geofence.enabled ? "text-primary" : "text-muted-foreground")} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setGeofenceModalState({ mode: "edit", geofence, groupId: geofence.groupId })}
                        disabled={isProcessing}
                        title="Edit geofence"
                        aria-label="Edit geofence"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          if (isProcessing) return
                          setDeleteGeofenceConfirm(geofence)
                        }}
                        disabled={isProcessing}
                        title="Remove geofence"
                        aria-label="Remove geofence"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="space-y-2">
            {pendingInvitations.map((invite) => {
              const groupName = groups.find((group) => group.id === invite.groupId)?.name || invite.groupId
              const isProcessing = incomingInvitationActionId === invite.id

              return (
                <Card key={invite.id} className="border-accent/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-accent/20">
                        <UserPlus className="w-5 h-5 text-accent" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Pending Invitation</h3>
                        <p className="text-sm text-muted-foreground mt-1">You've been invited to join {groupName}</p>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleInvitationResponse(invite.id, "accept")}
                            disabled={isProcessing}
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleInvitationResponse(invite.id, "decline")}
                            disabled={isProcessing}
                          >
                          {isProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                          Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      </div>
    </div>

    {/* Delete Geofence Confirmation */}
    <ConfirmDialog
      open={!!deleteGeofenceConfirm}
      onOpenChange={(open) => !open && setDeleteGeofenceConfirm(null)}
      title="Delete Geofence"
      description={`Delete geofence "${deleteGeofenceConfirm?.name}"? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
      onConfirm={confirmDeleteGeofence}
    />
    </>
  )
}
