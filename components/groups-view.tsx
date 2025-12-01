"use client"

import { useMemo, useState } from "react"
import { Plus, ChevronRight, Users, MapPin, Shield, Settings, Bell, UserPlus, CheckCircle2, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp, type Group } from "./app-provider"
import { cn } from "@/lib/utils"

export function GroupsView() {
  const {
    groups,
    geofences,
    groupInvitations,
    groupActivity,
    user,
    createGroup,
    inviteToGroup,
    respondToInvitation,
    joinGroup,
    leaveGroup,
    createGeofence,
    toggleGeofenceAlerts,
  } = useApp()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredGeofences = useMemo(() => {
    return selectedGroup ? geofences.filter((item) => item.groupId === selectedGroup) : geofences
  }, [geofences, selectedGroup])

  const filteredActivity = useMemo(() => {
    return selectedGroup ? groupActivity.filter((item) => item.groupId === selectedGroup) : groupActivity
  }, [groupActivity, selectedGroup])

  const pendingInvitations = groupInvitations.filter((invite) => invite.status === "pending")

  const handleCreateGroup = async () => {
    const name = window.prompt("Name your group")?.trim()
    if (!name) return

    const description = window.prompt("Description (optional)")?.trim()
    setIsSubmitting(true)

    try {
      await createGroup(name, description)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInvite = async (groupId: string) => {
    const email = window.prompt("Invite by email")?.trim()
    if (!email) return
    const role = window.prompt("Role (member/admin)", "member") === "admin" ? "admin" : "member"
    setIsSubmitting(true)
    try {
      await inviteToGroup(groupId, email, role)
    } finally {
      setIsSubmitting(false)
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
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateGeofence = async (groupId?: string | null) => {
    const name = window.prompt("Geofence name")?.trim()
    if (!name) return
    const latitude = Number(window.prompt("Center latitude", "0"))
    const longitude = Number(window.prompt("Center longitude", "0"))
    const radiusMeters = Number(window.prompt("Radius (meters)", "500"))

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    setIsSubmitting(true)
    try {
      await createGeofence({ name, latitude, longitude, radiusMeters, groupId: groupId ?? undefined })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInvitationResponse = async (invitationId: string, decision: "accept" | "decline") => {
    setIsSubmitting(true)
    try {
      await respondToInvitation(invitationId, decision)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Groups</h1>
          <Button className="gap-2" onClick={handleCreateGroup} disabled={isSubmitting}>
            <Plus className="w-4 h-4" />
            Create Group
          </Button>
        </div>

        {/* My Groups */}
        <div className="space-y-3">
          {groups.map((group) => {
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
                            onClick={() => handleInvite(group.id)}
                            disabled={isSubmitting}
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

                      {/* Quick Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          onClick={() => handleGroupMembership(group)}
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
                          onClick={() => handleCreateGeofence(group.id)}
                          disabled={isSubmitting}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Add Geofence
                        </Button>
                        <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                          <Settings className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Group Activity Feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {filteredActivity.map((activity) => (
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
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Geofences */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Geofences</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCreateGeofence(selectedGroup)}>
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {filteredGeofences.map((geofence) => (
              <Card key={geofence.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{geofence.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {geofence.notifyOnEntry ? "Entry" : ""}
                        {geofence.notifyOnEntry && geofence.notifyOnExit ? " & " : ""}
                        {geofence.notifyOnExit ? "Exit" : ""} alerts
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={geofence.enabled ? "outline" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleGeofenceAlerts(geofence.id, !geofence.enabled)}
                    disabled={isSubmitting}
                  >
                    <Bell className={cn("w-4 h-4", geofence.enabled ? "text-primary" : "text-muted-foreground")} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="space-y-2">
          {pendingInvitations.map((invite) => {
            const groupName = groups.find((group) => group.id === invite.groupId)?.name || invite.groupId

            return (
              <Card key={invite.id} className="border-accent/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-accent/20">
                      <UserPlus className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Pending Invitation</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {invite.recipientEmail || "You"} invited to join {groupName}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={() => handleInvitationResponse(invite.id, "accept")} disabled={isSubmitting}>
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInvitationResponse(invite.id, "decline")}
                          disabled={isSubmitting}
                        >
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
  )
}
