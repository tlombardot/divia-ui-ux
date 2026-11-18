import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  calculateDistanceMeters,
  getLineColor,
  getLineDirections,
  getLiveDeparturesForLine,
} from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, TransitStop, UserLocation } from '../../types';
import { getApproachingControllerAlertsForStation } from '../../utils/controllerTrackingUtils';
import {
  computeStationCrowdStatus,
  formatCrowdSourceLabel,
  getCrowdBadgeTheme,
} from '../../utils/crowdUtils';
import { AKHAAA_REPORT_LABELS } from '../../utils/quickReportUtils';

interface StationDetailContentProps {
  stop: TransitStop;
  userLocation: UserLocation;
  reports: Report[];
  isFavorite: boolean;
  onToggleFavorite: (stopId: string) => void;
  onClose: () => void;
  onNavigateToStop: (stop: TransitStop) => void;
  onReportAtStation?: (stop: TransitStop) => void;
  onVoteReport: (reportId: string, voteType: 'up' | 'down') => void;
}

export const StationDetailContent: React.FC<StationDetailContentProps> = ({
  stop,
  userLocation,
  reports,
  isFavorite,
  onToggleFavorite,
  onClose,
  onNavigateToStop,
  onReportAtStation,
  onVoteReport,
}) => {
  const distMeters = calculateDistanceMeters(
    userLocation.latitude,
    userLocation.longitude,
    stop.latitude,
    stop.longitude
  );
  const walkMin = Math.max(1, Math.round((distMeters * 1.25) / 75));

  const stopControllerReports = reports.filter(
    r =>
      r.status === 'active' &&
      (r.type === 'CONTROLLER' || !r.type) &&
      (r.stopId === stop.id ||
        r.progression?.currentStopId === stop.id ||
        r.stopName === stop.name)
  );

  const approachingAlerts = getApproachingControllerAlertsForStation(stop.id, reports).filter(
    a => a.etaMinutes > 0
  );

  const stationCrowd = computeStationCrowdStatus(stop.id, reports, stop.lines[0]);
  const crowdTheme = getCrowdBadgeTheme(stationCrowd.level);

  return (
    <View style={styles.container}>
      {/* Station Header with Star Favorite Toggle */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.stopTitle}>{stop.name}</Text>
          <Text style={styles.stopMeta}>
            Arrêt Divia · 🚶{' '}
            {distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`} ({walkMin} min)
          </Text>
          <View style={styles.badgesRow}>
            {stop.lines.map(lineId => (
              <View
                key={lineId}
                style={[styles.lineBadge, { backgroundColor: getLineColor(lineId) }]}
              >
                <Text style={styles.lineBadgeText}>{lineId}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => onToggleFavorite(stop.id)}
            style={[styles.starBtn, isFavorite && styles.starBtnActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.starIcon, isFavorite && styles.starIconActive]}>
              {isFavorite ? '★' : '☆'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Real-time Crowd Indicator Bar */}
        <View
          style={[
            styles.crowdCard,
            {
              backgroundColor: crowdTheme.bgColor,
              borderColor: crowdTheme.borderColor,
            },
          ]}
        >
          <View style={styles.crowdLeft}>
            <Text style={styles.crowdEmoji}>{crowdTheme.icon}</Text>
            <View>
              <Text style={[styles.crowdTitle, { color: crowdTheme.color }]}>
                Affluence : {crowdTheme.label} · {crowdTheme.longDesc}
              </Text>
              <Text style={styles.crowdSourceText}>
                {formatCrowdSourceLabel(stationCrowd)}
              </Text>
            </View>
          </View>
        </View>

        {/* Primary Action Buttons: Direct Report + Route to Stop */}
        <View style={styles.primaryActionsRow}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => onNavigateToStop(stop)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaIcon}>↱</Text>
            <Text style={styles.ctaText}>Itinéraire</Text>
          </TouchableOpacity>

          {onReportAtStation && (
            <TouchableOpacity
              style={styles.reportStationBtn}
              onPress={() => onReportAtStation(stop)}
              activeOpacity={0.85}
              accessibilityLabel={`${AKHAAA_REPORT_LABELS.fabAccessibilityLabel} à ${stop.name}`}
              accessibilityRole="button"
            >
              <Text style={styles.reportStationIcon}>🚨</Text>
              <Text style={styles.reportStationText} numberOfLines={1}>
                {AKHAAA_REPORT_LABELS.stationButtonPrefix} · {stop.name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Predictive Approaching Controller Warning Banners */}
        {approachingAlerts.map(pred => (
          <View key={`pred-${pred.reportId}`} style={styles.predictiveBanner}>
            <Text style={styles.predictiveBannerText}>{pred.message}</Text>
          </View>
        ))}

        {/* Active Controller Alerts at this Station */}
        {stopControllerReports.map(rep => {
          const minsAgo = Math.max(1, Math.round((Date.now() - rep.reportedAt) / 60000));
          return (
            <View key={rep.id} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertTitle}>🚨 Contrôleurs signalés ({rep.lineId})</Text>
                <Text style={styles.alertTime}>Il y a {minsAgo} min</Text>
              </View>
              <Text style={styles.alertDesc}>
                {rep.direction} · Fiabilité {rep.reliabilityScore}%
              </Text>
              {rep.description ? (
                <Text style={styles.alertQuote}>« {rep.description} »</Text>
              ) : null}
              <View style={styles.voteRow}>
                <TouchableOpacity
                  style={styles.voteUpBtn}
                  onPress={() => onVoteReport(rep.id, 'up')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.voteUpText}>👍 Toujours là ({rep.upvotes})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.voteDownBtn}
                  onPress={() => onVoteReport(rep.id, 'down')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.voteDownText}>👎 Partis ({rep.downvotes})</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Next Departures Board */}
        <Text style={styles.boardTitle}>Prochains passages en temps réel</Text>

        {stop.lines.map(lineId => {
          const [dirA, dirB] = getLineDirections(lineId);
          const [depA1, depA2] = getLiveDeparturesForLine(lineId);
          const [depB1, depB2] = [depA1 + 2, depA2 + 2];
          const color = getLineColor(lineId);
          const lineCrowd = computeStationCrowdStatus(stop.id, reports, lineId);
          const lineCrowdTheme = getCrowdBadgeTheme(lineCrowd.level);

          return (
            <View key={lineId} style={styles.lineBoard}>
              <View style={styles.directionRow}>
                <View style={[styles.smallLinePill, { backgroundColor: color }]}>
                  <Text style={styles.smallLineText}>{lineId}</Text>
                </View>
                <Text style={styles.directionLabel} numberOfLines={1}>
                  Vers {dirA}
                </Text>
                <Text style={[styles.lineCrowdMini, { color: lineCrowdTheme.color }]}>
                  {lineCrowdTheme.icon}
                </Text>
                <View style={styles.timesGroup}>
                  <Text style={styles.liveTimeStrong}>{depA1} min</Text>
                  <Text style={styles.liveTimeNext}>, {depA2} min</Text>
                </View>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.directionRow}>
                <View style={[styles.smallLinePill, { backgroundColor: color }]}>
                  <Text style={styles.smallLineText}>{lineId}</Text>
                </View>
                <Text style={styles.directionLabel} numberOfLines={1}>
                  Vers {dirB}
                </Text>
                <Text style={[styles.lineCrowdMini, { color: lineCrowdTheme.color }]}>
                  {lineCrowdTheme.icon}
                </Text>
                <View style={styles.timesGroup}>
                  <Text style={styles.liveTimeStrong}>{depB1} min</Text>
                  <Text style={styles.liveTimeNext}>, {depB2} min</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  headerLeft: {
    flex: 1,
  },
  stopTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#202124',
  },
  stopMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  lineBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lineBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  starBtnActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  starIcon: {
    fontSize: 20,
    color: '#5F6368',
  },
  starIconActive: {
    color: '#D97706',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5F6368',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 12,
  },
  crowdCard: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  crowdLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crowdEmoji: {
    fontSize: 20,
  },
  crowdTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  crowdSourceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 2,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ctaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cassis,
    borderRadius: 24,
    paddingVertical: 12,
    gap: 6,
  },
  ctaIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  reportStationBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F5',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: COLORS.magenta,
    gap: 6,
  },
  reportStationIcon: {
    fontSize: 15,
  },
  reportStationText: {
    color: COLORS.cassis,
    fontSize: 13,
    fontWeight: '800',
  },
  alertCard: {
    backgroundColor: '#FEF3F2',
    borderWidth: 1.5,
    borderColor: '#FECDCA',
    borderRadius: 14,
    padding: 12,
  },
  predictiveBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  predictiveBannerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B42318',
  },
  alertTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A271A',
  },
  alertDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#912018',
    marginTop: 4,
  },
  alertQuote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#7A271A',
    marginTop: 4,
  },
  voteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  voteUpBtn: {
    flex: 1,
    backgroundColor: '#E6F4EA',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E8E3E',
  },
  voteUpText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#137333',
  },
  voteDownBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  voteDownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F6368',
  },
  boardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5F6368',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lineBoard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#E8EAED',
  },
  smallLinePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginRight: 10,
  },
  smallLineText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  directionLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#202124',
  },
  lineCrowdMini: {
    fontSize: 13,
    marginHorizontal: 6,
  },
  timesGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 4,
  },
  liveTimeStrong: {
    fontSize: 14,
    fontWeight: '900',
    color: '#137333',
  },
  liveTimeNext: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
  },
});
