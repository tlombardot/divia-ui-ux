import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getLineColor } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report } from '../../types';
import { resolveControllerProgression } from '../../utils/controllerTrackingUtils';

interface ReportCardProps {
  report: Report;
  onVoteUp: (reportId: string, recalibrateStopId?: string) => void;
  onVoteDown: (reportId: string) => void;
  onClose: () => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({
  report,
  onVoteUp,
  onVoteDown,
  onClose,
}) => {
  const minutesAgo = Math.max(1, Math.round((Date.now() - report.reportedAt) / 60000));
  const prog = resolveControllerProgression(report);
  const lineBg = getLineColor(report.lineId);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <View style={[styles.badgeLine, { backgroundColor: lineBg }]}>
            <Text style={styles.badgeLineText}>{report.lineId}</Text>
          </View>
          <View style={styles.titleTexts}>
            <Text style={styles.stopName}>
              {prog?.mode === 'MOVING'
                ? `Vers ${prog.currentStopName}`
                : report.stopName}
            </Text>
            <Text style={styles.directionText}>
              {prog?.summaryText || report.direction}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming threatened stops with ETA */}
      {prog?.mode === 'MOVING' && prog.upcomingStops.length > 0 && (
        <View style={styles.upcomingBox}>
          <Text style={styles.upcomingTitle}>Prochains arrêts menacés :</Text>
          <View style={styles.upcomingChips}>
            {prog.upcomingStops.map(up => (
              <View key={up.stationId} style={styles.upcomingChip}>
                <Text style={styles.upcomingChipText}>
                  {up.stationName} · ~{up.etaMinutes} min
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {report.description ? (
        <Text style={styles.description}>« {report.description} »</Text>
      ) : null}

      <View style={styles.metaRow}>
        <Text style={styles.timeAgo}>Signalé il y a {minutesAgo} min</Text>
        <View style={styles.reliabilityBadge}>
          <Text style={styles.reliabilityText}>
            Fiabilité {report.reliabilityScore}% ({report.upvotes} 👍 / {report.downvotes} 👎)
          </Text>
        </View>
      </View>

      {/* Community Voting Buttons */}
      <View style={styles.voteRow}>
        <TouchableOpacity
          style={[styles.voteButton, styles.voteUpButton]}
          onPress={() => onVoteUp(report.id, prog?.currentStopId)}
          activeOpacity={0.8}
        >
          <Text style={styles.voteUpText}>👍 Toujours là</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.voteButton, styles.voteDownButton]}
          onPress={() => onVoteDown(report.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.voteDownText}>👎 Partis</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 60,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badgeLine: {
    backgroundColor: COLORS.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  badgeLineText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  titleTexts: {
    flex: 1,
  },
  stopName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  directionText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  description: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontStyle: 'italic',
    marginTop: 8,
    backgroundColor: COLORS.surface,
    padding: 8,
    borderRadius: 8,
  },
  upcomingBox: {
    marginTop: 10,
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 10,
    padding: 9,
  },
  upcomingTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B42318',
    marginBottom: 5,
  },
  upcomingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  upcomingChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDA29B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  upcomingChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#912018',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  timeAgo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  reliabilityBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reliabilityText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  voteRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  voteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  voteUpButton: {
    backgroundColor: '#E6F4EA',
    borderWidth: 1.5,
    borderColor: COLORS.success,
  },
  voteUpText: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '800',
  },
  voteDownButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
  },
  voteDownText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
