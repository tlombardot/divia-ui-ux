import { io, Socket } from 'socket.io-client';
import { Report } from '../types';
import { getBaseApiUrl } from './apiService';

class SocketService {
  private socket: Socket | null = null;
  private syncListeners: ((reports: Report[]) => void)[] = [];
  private newReportListeners: ((report: Report) => void)[] = [];
  private updateReportListeners: ((report: Report) => void)[] = [];
  private removeReportListeners: ((reportId: string) => void)[] = [];

  public connect(): void {
    if (this.socket) return;

    const url = getBaseApiUrl();
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    this.socket.on('reports:sync', (reports: Report[]) => {
      this.syncListeners.forEach(l => l(reports));
    });

    this.socket.on('report:new', (report: Report) => {
      this.newReportListeners.forEach(l => l(report));
    });

    this.socket.on('report:updated', (report: Report) => {
      this.updateReportListeners.forEach(l => l(report));
    });

    this.socket.on('report:removed', (payload: { reportId: string }) => {
      this.removeReportListeners.forEach(l => l(payload.reportId));
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public onReportsSync(callback: (reports: Report[]) => void): () => void {
    this.syncListeners.push(callback);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== callback);
    };
  }

  public onNewReport(callback: (report: Report) => void): () => void {
    this.newReportListeners.push(callback);
    return () => {
      this.newReportListeners = this.newReportListeners.filter(l => l !== callback);
    };
  }

  public onUpdateReport(callback: (report: Report) => void): () => void {
    this.updateReportListeners.push(callback);
    return () => {
      this.updateReportListeners = this.updateReportListeners.filter(l => l !== callback);
    };
  }

  public onRemoveReport(callback: (reportId: string) => void): () => void {
    this.removeReportListeners.push(callback);
    return () => {
      this.removeReportListeners = this.removeReportListeners.filter(l => l !== callback);
    };
  }

  public emitCreateReport(report: unknown): void {
    if (this.socket?.connected) {
      this.socket.emit('report:create', report);
    }
  }

  public emitVoteReport(payload: { reportId: string; voteType: 'up' | 'down' }): void {
    if (this.socket?.connected) {
      this.socket.emit('report:vote', payload);
    }
  }
}

export const socketService = new SocketService();
