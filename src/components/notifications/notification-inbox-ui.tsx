import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listMyNotifications,
  markNotificationRead,
} from "@/lib/notifications-parent-permissions.functions";

const PAGE_SIZE = 20;
type NotificationRow = {
  delivery_id: string;
  notification_id: string;
  notification_type: string;
  title: string;
  preview: string;
  deep_link: string | null;
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
  source_request_id: string | null;
  unread_count: number;
};

const KNOWN_NOTIFICATION_TYPES = new Set([
  "permission_request_published",
  "permission_request_reminder",
  "permission_request_closed",
  "permission_request_cancelled",
]);

function rows(value: unknown): NotificationRow[] {
  return Array.isArray(value) ? (value as NotificationRow[]) : [];
}
function date(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
function isSafeDeepLink(link: string | null) {
  return Boolean(link && link.startsWith("/"));
}

function safeNotificationTitle(item: NotificationRow) {
  return KNOWN_NOTIFICATION_TYPES.has(item.notification_type) ? item.title : "Notification";
}

export function NotificationInboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetch = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["notifications", "inbox", page],
    queryFn: () => fetch({ data: { pageSize: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
  });
  const read = useMutation({
    mutationFn: (id: string) => markRead({ data: { notificationRecipientId: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Notification could not be marked as read."),
  });
  const data = rows(query.data);
  const unread = data[0]?.unread_count ?? 0;
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              Your authenticated in-app notification inbox.
            </p>
          </div>
          {unread > 0 && <Badge variant="default">{unread} unread</Badge>}
        </div>
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertTitle>We couldn't load notifications</AlertTitle>
            <AlertDescription>
              <p>Please try again. If the problem continues, contact your school administrator.</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-base">You're all caught up</CardTitle>
              <CardDescription>New in-app notifications will appear here.</CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <Card
                key={item.delivery_id}
                className={item.read_at ? "" : "border-primary/50 bg-primary/[0.03]"}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className="mt-1 rounded-full bg-primary/10 p-2">
                      <Bell className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="font-medium">{safeNotificationTitle(item)}</h2>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {date(item.created_at)} · {item.read_at ? "Read" : "Unread"}
                          </p>
                        </div>
                        {!item.read_at && <Badge variant="secondary">Unread</Badge>}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{item.preview}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isSafeDeepLink(item.deep_link) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!item.read_at) read.mutate(item.delivery_id);
                              navigate({ to: item.deep_link as never });
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </Button>
                        ) : item.source_request_id ? (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!item.read_at) read.mutate(item.delivery_id);
                            }}
                          >
                            <Link
                              to="/permission-requests/$requestId"
                              params={{ requestId: item.source_request_id }}
                            >
                              Open request
                            </Link>
                          </Button>
                        ) : null}
                        {!item.read_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={read.isPending}
                            onClick={() => read.mutate(item.delivery_id)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="flex justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={data.length < PAGE_SIZE}
            onClick={() => setPage(page + 1)}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export function safeNotificationDestination(link: string | null) {
  return isSafeDeepLink(link) ? link : null;
}
