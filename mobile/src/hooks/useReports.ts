import { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { Report } from '../types';

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initial fetch
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

    // Socket.io real-time listeners
    socketService.connect();

    const unsubSync = socketService.onReportsSync((syncedReports) => {
      setReports(syncedReports);
    });

    const unsubNew = socketService.onNewReport((newReport) => {
      setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
    });

    const unsubUpdate = socketService.onUpdateReport((updatedReport) => {
      setReports(prev =>
        prev.map(r => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    const unsubRemove = socketService.onRemoveReport((reportId) => {
      setReports(prev => prev.filter(r => r.id !== reportId));
    });

    return () => {
      unsubSync();
      unsubNew();
      unsubUpdate();
      unsubRemove();
    };
  }, [fetchReports]);

  const createReport = useCallback(
    async (payload: {
      stopId: string;
      stopName: string;
      lineId: string;
      lineName: string;
      latitude: number;
      longitude: number;
      direction: string;
      description?: string;
    }) => {
      const created = await apiService.createReport(payload);
      if (created) {
        setReports(prev => [created, ...prev.filter(r => r.id !== created.id)]);
        socketService.emitCreateReport(payload);
      }
      return created;
    },
    []
  );

  const voteReport = useCallback(
    async (reportId: string, voteType: 'up' | 'down') => {
      // Optimistic update
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
    },
    []
  );

  return {
    reports,
    isLoading,
    refreshReports: fetchReports,
    createReport,
    voteReport,
  };
}
