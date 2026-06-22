"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { Period } from "@/types";

export function useLeaderboard(period: Period) {
  return useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => api.getLeaderboard(period),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: api.getUsers,
    staleTime: Infinity,
  });
}

export function useUser(username: string, period: Period) {
  return useQuery({
    queryKey: ["user", username, period],
    queryFn: () => api.getUser(username, period),
    enabled: Boolean(username),
  });
}

export function useTickets(period: Period, assignee?: string) {
  return useQuery({
    queryKey: ["tickets", period, assignee],
    queryFn: () => api.getTickets(period, assignee),
  });
}

export function usePullRequests(period: Period, user?: string) {
  return useQuery({
    queryKey: ["pull-requests", period, user],
    queryFn: () => api.getPullRequests(period, user),
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.refresh,
    onSuccess: () => qc.invalidateQueries(),
  });
}
