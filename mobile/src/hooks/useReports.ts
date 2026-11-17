import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { CrowdLevel, Report, ReportType } from '../types';

export interface CreateReportPayload {
  type?: ReportType;
  stopId: string;
  stopName: string;
  lineId: string;
  lineName: string;
  latitude: number;
  longitude: number;
  direction: string;
  description?: string;
  crowdLevel?: CrowdLevel;
}

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await apiService.fetchReports();
      setReports(list);
    } catch (e) {
      console.warn('[useReports] Erreur chargement initial:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();

    socketService.connect();

    const unsubSync = socketService.onReportsSync(syncedReports => {
      setReports(syncedReports);
    });

    const unsubNew = socketService.onNewReport(newReport => {
      setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
    });

    const unsubUpdate = socketService.onUpdateReport(updatedReport => {
      setReports(prev =>
        prev.map(r => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    const unsubRemove = socketService.onRemoveReport(reportId => {
      setReports(prev => prev.filter(r => r.id !== reportId));
    });

    return () => {
      unsubSync();
      unsubNew();
      unsubUpdate();
      unsubRemove();
    };
  }, [fetchReports]);

  const createReport = useCallback(async (payload: CreateReportPayload) => {
    const reportType: ReportType = payload.type || 'CONTROLLER';
    const created = await apiService.createReport({ ...payload, type: reportType });

    if (created) {
      setReports(prev => [created, ...prev.filter(r => r.id !== created.id)]);
      return created;
    }

    // Optimistic local fallback if server is temporarily offline
    const now = Date.now();
    const ttlMs = reportType === 'CROWD' ? 25 * 60 * 1000 : 40 * 60 * 1000;
    const optimistic: Report = {
      id: `local-${now}`,
      type: reportType,
      stopId: payload.stopId,
      stopName: payload.stopName,
      lineId: payload.lineId,
      lineName: payload.lineName,
      latitude: payload.latitude,
      longitude: payload.longitude,
      direction: payload.direction,
      description: payload.description,
      crowdLevel: payload.crowdLevel,
      reportedAt: now,
      expiresAt: now + ttlMs,
      upvotes: 1,
      downvotes: 0,
      reliabilityScore: 80,
      status: 'active',
    };
    setReports(prev => [optimistic, ...prev]);
    socketService.emitCreateReport({ ...payload, type: reportType });
    return optimistic;
  }, []);

  const voteReport = useCallback(async (reportId: string, voteType: 'up' | 'down') => {
    setReports(prev =>
      prev
        .map(r => {
          if (r.id !== reportId) return r;
          if (voteType === 'up') {
            return {
              ...r,
              upvotes: r.upvotes + 1,
              reliabilityScore: Math.min(100, r.reliabilityScore + 5),
            };
          } else {
            return {
              ...r,
              downvotes: r.downvotes + 1,
              reliabilityScore: Math.max(0, r.reliabilityScore - 25),
            };
          }
        })
        .filter(r => r.reliabilityScore > 20)
    );

    const success = await apiService.voteReport(reportId, voteType);
    if (success) {
      socketService.emitVoteReport({ reportId, voteType });
    }
  }, []);

  const controllerReports = useMemo(
    () => reports.filter(r => r.status === 'active' && (r.type === 'CONTROLLER' || !r.type)),
    [reports]
  );

  const crowdReports = useMemo(
    () => reports.filter(r => r.status === 'active' && r.type === 'CROWD'),
    [reports]
  );

  return {
    reports,
    controllerReports,
    crowdReports,
    isLoading,
    refreshReports: fetchReports,
    createReport,
    voteReport,
  };
}
