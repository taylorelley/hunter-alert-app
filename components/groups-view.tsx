"use client"

import { useState } from "react"
import { Plus, ChevronRight, Users, MapPin, Shield, Settings, Bell, UserPlus, Crown, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "./app-provider"
import { cn } from "@/lib/utils"

export function GroupsView() {
  const { groups } = useApp()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const groupActivity = [
    {
      id: "1",
      type: "waypoint",
      user: "Tom W.",
      action: "added waypoint",
      target: "South Ridge Blind",
      time: "2h ago",
    },
    { id: "2", type: "checkin", user: "Dave B.", action: "checked in", target: "All Good", time: "3h ago" },
    { id: "3", type: "geofence", user: "Mike J.", action: "entered", target: "Base Camp Zone", time: "5h ago" },
  ]

  const geofences = [
    { id: "1", name: "Base Camp Zone", members: 2, alertType: "entry" },
    { id: "2", name: "Hunting Area A", members: 3, alertType: "exit" },
  ]

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Groups</h1>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Group
          </Button>
        </div>

        {/* My Groups */}
        <div className="space-y-3">
          {groups.map((group) => (
            <Card
              key={group.id}
              className={cn(
                "cursor-pointer transition-colors",
                selectedGroup === group.id ? "ring-2 ring-primary" : "hover:bg-muted/50",
              )}
              onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        {group.name}
                        <Crown className="w-4 h-4 text-accent" />
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
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
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
                      <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                        <MapPin className="w-4 h-4 mr-1" />
                        Waypoints
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                        <Shield className="w-4 h-4 mr-1" />
                        Geofences
                      </Button>
                      <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Group Activity Feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {groupActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-4">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      activity.type === "waypoint" && "bg-accent/20",
                      activity.type === "checkin" && "bg-safe/20",
                      activity.type === "geofence" && "bg-primary/20",
                    )}
                  >
                    {activity.type === "waypoint" && <MapPin className="w-4 h-4 text-accent" />}
                    {activity.type === "checkin" && <CheckCircle2 className="w-4 h-4 text-safe" />}
                    {activity.type === "geofence" && <Shield className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.user}</span>
                      <span className="text-muted-foreground"> {activity.action} </span>
                      <span className="font-medium">{activity.target}</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{activity.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Geofences */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Geofences</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {geofences.map((geofence) => (
              <Card key={geofence.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{geofence.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {geofence.members} inside • {geofence.alertType} alerts
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Bell className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Invitations */}
        <Card className="border-accent/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-accent/20">
                <UserPlus className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Pending Invitation</h3>
                <p className="text-sm text-muted-foreground mt-1">John D. invited you to join "Mountain Hunters"</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm">Accept</Button>
                  <Button size="sm" variant="outline">
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
