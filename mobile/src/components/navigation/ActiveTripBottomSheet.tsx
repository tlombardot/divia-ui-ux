import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLineColor } from '../../data/dijonNetwork';
import { NavState } from '../../hooks/useLiveNavigation';
import { COLORS } from '../../theme/colors';
import { Report, RouteOption } from '../../types';

interface ActiveTripBottomSheetProps {
  route: RouteOption;
  navState: NavState;
  currentSegmentIndex: number;
  distanceToNextStep: number;
  passedStopsCount: number;
  alightingWarning: string | null;
  liveControllerAlert?: Report | null;
  onDismissControllerAlert?: (id: string) => void;
  isSimulating: boolean;
  simulationProgress: number;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
  onEndTrip: () => void;
}

function getManeuverArrow(instruction: string): string {
  const lower = instruction.toLowerCase();
  if (lower.includes('gauche')) return '↰';
  if (lower.includes('droite')) return '↱';
  if (lower.includes('demi-tour')) return '↶';
  return '↑';
}

export const ActiveTripBottomSheet: React.FC<ActiveTripBottomSheetProps> = ({
  route,
  navState,
  currentSegmentIndex,
  distanceToNextStep,
  passedStopsCount,
  alightingWarning,
  liveControllerAlert,
  onDismissControllerAlert,
  isSimulating,
  simulationProgress,
  onStartSimulation,
  onStopSimulation,
  onEndTrip,
}) => {
  const insets = useSafeAreaInsets();
  const [showSimMenu, setShowSimMenu] = useState(false);

  const currentSegment = route.segments[currentSegmentIndex] || route.segments[0];
  const passedStops = currentSegment?.passedStops || [];
  const totalStops = Math.max(1, passedStops.length - 1);
  const remainingStops = Math.max(0, totalStops - passedStopsCount);
  const remainingTransitMin = Math.max(1, remainingStops * 2);

  // Remaining total minutes estimate
  const remainingSegmentsMin = route.segments
    .slice(currentSegmentIndex + 1)
    .reduce((acc, s) => acc + s.durationMinutes, 0);
  const currentRemMin =
    navState === 'ARRIVED'
      ? 0
      : navState === 'ON_TRANSIT'
        ? remainingTransitMin
        : Math.max(1, Math.round(distanceToNextStep / 75) || currentSegment.durationMinutes);
  const totalRemainingMin = navState === 'ARRIVED' ? 0 : currentRemMin + remainingSegmentsMin;

  // Overall route progress (0 to 100%)
  const overallProgressPercent =
    navState === 'ARRIVED'
      ? 100
      : isSimulating
        ? Math.min(100, Math.round(simulationProgress * 100))
        : Math.min(
            95,
            Math.round(((currentSegmentIndex + 0.5) / Math.max(1, route.segments.length)) * 100)
          );

  // Primary street turn instruction for walking
  const streetInstruction =
    currentSegment?.turnInstructions?.[0] || currentSegment?.instruction || 'Suivez le tracé';
  const lineColor =
    currentSegment?.lineColor || getLineColor(currentSegment?.lineId || 'T1');
  const isWarningMode = Boolean(alightingWarning);

  return (
    <View pointerEvents="box-none" style={styles.hudOverlay}>
      {/* ===================================================================== */}
      {/* TOP MANEUVER HUD BANNER (Google Maps Turn-by-Turn style)              */}
      {/* ===================================================================== */}
      <View
        style={[
          styles.topBanner,
          { paddingTop: Math.max(insets.top + 8, 16) },
          isWarningMode && styles.topBannerWarning,
          navState === 'ARRIVED' && styles.topBannerArrived,
        ]}
      >
        {navState === 'ARRIVED' ? (
          <View style={styles.maneuverRow}>
            <View style={styles.arrowBoxArrived}>
              <Text style={styles.bigEmoji}>🏁</Text>
            </View>
            <View style={styles.maneuverTexts}>
              <Text style={styles.maneuverDistance}>Vous êtes arrivé</Text>
              <Text style={styles.maneuverPrimary}>Destination atteinte avec succès</Text>
            </View>
          </View>
        ) : navState === 'ON_TRANSIT' ? (
          <View style={styles.maneuverRow}>
            <View style={[styles.transitBadgeLarge, { backgroundColor: lineColor }]}>
              <Text style={styles.transitBadgeText}>{currentSegment.lineId}</Text>
            </View>
            <View style={styles.maneuverTexts}>
              {isWarningMode ? (
                <>
                  <Text style={styles.warningKicker}>🔔 PRÉPAREZ-VOUS À DESCENDRE</Text>
                  <Text style={styles.maneuverPrimary} numberOfLines={2}>
                    Prochain arrêt : {currentSegment.toStop?.name}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.maneuverDistance}>
                    Descendez à {currentSegment.toStop?.name}
                  </Text>
                  <Text style={styles.maneuverPrimary}>
                    {remainingStops} arrêt{remainingStops > 1 ? 's' : ''} restant
                    {remainingStops > 1 ? 's' : ''} ({remainingTransitMin} min)
                  </Text>
                </>
              )}
              <Text style={styles.maneuverSub} numberOfLines={1}>
                {currentSegment.direction || currentSegment.lineName}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.maneuverRow}>
            <View style={styles.arrowBox}>
              <Text style={styles.arrowIcon}>{getManeuverArrow(streetInstruction)}</Text>
            </View>
            <View style={styles.maneuverTexts}>
              <Text style={styles.maneuverDistance}>
                {distanceToNextStep > 0
                  ? `Dans ${Math.round(distanceToNextStep)} m`
                  : navState === 'TRANSFER'
                    ? 'Correspondance quai à quai'
                    : 'En route à pied'}
              </Text>
              <Text style={styles.maneuverPrimary} numberOfLines={2}>
                {streetInstruction}
              </Text>
              <Text style={styles.maneuverSub} numberOfLines={1}>
                {navState === 'WALKING_TO_STOP' && currentSegment.toStop
                  ? `Vers l'arrêt ${currentSegment.toStop.name} · Bascule auto (< 30 m)`
                  : 'Guidage piéton GPS · Arrivée auto (< 25 m)'}
              </Text>
            </View>
          </View>
        )}

        {/* Next Step Preview Strip inside Top Banner */}
        {navState !== 'ARRIVED' && route.segments[currentSegmentIndex + 1] && (
          <View style={styles.nextPreviewStrip}>
            <Text style={styles.nextPreviewLabel}>Ensuite : </Text>
            <Text style={styles.nextPreviewText} numberOfLines={1}>
              {route.segments[currentSegmentIndex + 1].instruction}
            </Text>
          </View>
        )}
      </View>

      {/* ===================================================================== */}
      {/* NON-BLOCKING LIVE WAZE CONTROLLER ALERT BANNER                        */}
      {/* ===================================================================== */}
      {liveControllerAlert && (
        <View style={styles.wazeLiveAlert}>
          <Text style={styles.wazeAlertIcon}>🚨</Text>
          <View style={styles.wazeAlertTexts}>
            <Text style={styles.wazeAlertTitle}>
              Contrôle signalé devant vous ({liveControllerAlert.lineId})
            </Text>
            <Text style={styles.wazeAlertSub} numberOfLines={1}>
              Arrêt {liveControllerAlert.stopName} · {liveControllerAlert.direction}
            </Text>
          </View>
          {onDismissControllerAlert && (
            <TouchableOpacity
              style={styles.wazeDismissBtn}
              onPress={() => onDismissControllerAlert(liveControllerAlert.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.wazeDismissText}>Vu</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Spacer allowing full map touch interaction in the middle */}
      <View pointerEvents="none" style={styles.mapPassthrough} />

      {/* ===================================================================== */}
      {/* COMPACT BOTTOM CARD (ETA + Progress + Discreet Simulator + Quitter)   */}
      {/* ===================================================================== */}
      <View
        style={[
          styles.bottomCard,
          { paddingBottom: Math.max(insets.bottom + 4, 14) },
        ]}
      >
        {/* Route Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${overallProgressPercent}%`,
                backgroundColor: navState === 'ARRIVED' ? '#1E8E3E' : COLORS.cassis,
              },
            ]}
          />
        </View>

        {/* Main Compact Row: Remaining Time / Arrival / Quit */}
        <View style={styles.compactRow}>
          <View style={styles.etaColumn}>
            <View style={styles.etaTopLine}>
              <Text style={styles.etaMinutes}>
                {navState === 'ARRIVED' ? 'Arrivé' : `${totalRemainingMin} min`}
              </Text>
              <Text style={styles.etaArrival}>· Arrivée {route.arrivalTime}</Text>
            </View>
            <Text style={styles.etaSub} numberOfLines={1}>
              {route.summary}
            </Text>
          </View>

          <View style={styles.actionsGroup}>
            {/* Discreet Demo GPS Simulator Toggle */}
            <TouchableOpacity
              style={[styles.simTogglePill, isSimulating && styles.simToggleActive]}
              onPress={() => setShowSimMenu(prev => !prev)}
              activeOpacity={0.75}
            >
              <Text style={styles.simToggleText}>{isSimulating ? '📡 Démo' : '⚙'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quitButton}
              onPress={onEndTrip}
              activeOpacity={0.8}
            >
              <Text style={styles.quitButtonText}>
                {navState === 'ARRIVED' ? 'Terminer' : 'Quitter'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Discreet Expandable GPS Simulator Drawer (for Jury / Home testing) */}
        {(showSimMenu || isSimulating) && navState !== 'ARRIVED' && (
          <View style={styles.simBar}>
            <Text style={styles.simBarLabel}>
              Simulateur GPS ({Math.round(simulationProgress * 100)}%)
            </Text>
            <TouchableOpacity
              style={[styles.simActionBtn, isSimulating && styles.simActionStop]}
              onPress={isSimulating ? onStopSimulation : onStartSimulation}
              activeOpacity={0.8}
            >
              <Text style={styles.simActionText}>
                {isSimulating ? '⏸ Pause' : '▶ Simuler le trajet GPS'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hudOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    zIndex: 50,
  },
  topBanner: {
    backgroundColor: '#1E1B24',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 10,
  },
  topBannerWarning: {
    backgroundColor: '#B75500',
  },
  topBannerArrived: {
    backgroundColor: '#137333',
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  arrowBoxArrived: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  arrowIcon: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },
  bigEmoji: {
    fontSize: 28,
  },
  transitBadgeLarge: {
    width: 54,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  transitBadgeText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  maneuverTexts: {
    flex: 1,
  },
  warningKicker: {
    color: '#FFF3E0',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  maneuverDistance: {
    color: '#D2E3FC',
    fontSize: 14,
    fontWeight: '800',
  },
  maneuverPrimary: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  maneuverSub: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  nextPreviewStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  nextPreviewLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  nextPreviewText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  wazeLiveAlert: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#C5221F',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  wazeAlertIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  wazeAlertTexts: {
    flex: 1,
  },
  wazeAlertTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  wazeAlertSub: {
    color: '#FCE8E6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  wazeDismissBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  wazeDismissText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  mapPassthrough: {
    flex: 1,
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 12,
  },
  progressTrack: {
    height: 4.5,
    backgroundColor: '#E8EAED',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  etaColumn: {
    flex: 1,
    marginRight: 10,
  },
  etaTopLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  etaMinutes: {
    fontSize: 22,
    fontWeight: '900',
    color: '#137333',
  },
  etaArrival: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5F6368',
  },
  etaSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 2,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simTogglePill: {
    height: 40,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simToggleActive: {
    backgroundColor: '#FCE4EC',
  },
  simToggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.cassis,
  },
  quitButton: {
    backgroundColor: '#FCE8E6',
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FAD2CF',
  },
  quitButtonText: {
    color: '#C5221F',
    fontSize: 14,
    fontWeight: '800',
  },
  simBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  simBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F6368',
  },
  simActionBtn: {
    backgroundColor: COLORS.cassis,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  simActionStop: {
    backgroundColor: '#5F6368',
  },
  simActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
