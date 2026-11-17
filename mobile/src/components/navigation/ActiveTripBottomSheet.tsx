import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export const ActiveTripBottomSheet: React.FC<ActiveTripBottomSheetProps> = ({
  route,
  navState,
  currentSegmentIndex,
  distanceToNextStep,
  passedStopsCount,
  alightingWarning,
  isSimulating,
  simulationProgress,
  onStartSimulation,
  onStopSimulation,
  onEndTrip,
}) => {
  const insets = useSafeAreaInsets();
  const currentSegment = route.segments[currentSegmentIndex] || route.segments[0];
  const passedStops = currentSegment.passedStops || [];
  const totalStops = passedStops.length;
  const remainingStops = Math.max(0, totalStops - passedStopsCount);

  return (
    <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Drag handle */}
      <View style={styles.dragHandleWrapper}>
        <View style={styles.dragHandle} />
      </View>

      {/* Alighting Alert Banner (1 stop before destination) */}
      {alightingWarning && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerIcon}>🔔</Text>
          <Text style={styles.warningBannerText}>{alightingWarning}</Text>
        </View>
      )}

      {/* Navigation State Header */}
      <View style={styles.headerRow}>
        <View style={styles.navStateBadge}>
          <View style={styles.livePulseDot} />
          <Text style={styles.navStateBadgeText}>
            {navState === 'WALKING_TO_STOP' && 'GUIDAGE PIÉTON VERS ARRÊT'}
            {navState === 'ON_TRANSIT' && `À BORD · ${currentSegment.lineId || 'TRANSIT'}`}
            {navState === 'TRANSFER' && 'CORRESPONDANCE QUAI À QUAI'}
            {navState === 'WALKING_TO_DEST' && 'MARCHE VERS DESTINATION'}
            {navState === 'ARRIVED' && 'ARRIVÉE À DESTINATION'}
          </Text>
        </View>
        <Text style={styles.arrivalTime}>Arrivée estimée : {route.arrivalTime}</Text>
      </View>

      {/* Dynamic Geofenced Content */}
      <View style={styles.stepContent}>
        {navState === 'ARRIVED' ? (
          <View style={styles.arrivedBox}>
            <Text style={styles.arrivedEmoji}>🎉</Text>
            <Text style={styles.arrivedTitle}>Vous êtes arrivé à destination !</Text>
            <Text style={styles.arrivedSubtitle}>
              Trajet effectué en {route.totalDurationMinutes} minutes
            </Text>
          </View>
        ) : navState === 'ON_TRANSIT' ? (
          <View style={styles.transitContainer}>
            <View style={styles.transitRow}>
              <View
                style={[
                  styles.lineCircle,
                  { backgroundColor: currentSegment.lineColor || COLORS.cassis },
                ]}
              >
                <Text style={styles.lineCircleText}>{currentSegment.lineId}</Text>
              </View>

              <View style={styles.instructionColumn}>
                <Text style={styles.instructionTitle}>{currentSegment.instruction}</Text>
                {currentSegment.toStop && (
                  <Text style={styles.subInstruction}>
                    Descente prévue à {currentSegment.toStop.name}
                  </Text>
                )}
              </View>
            </View>

            {/* Real-time Stations Progress (Automatic Geofencing) */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${totalStops > 0 ? (passedStopsCount / totalStops) * 100 : 0}%`,
                      backgroundColor: currentSegment.lineColor || COLORS.cassis,
                    },
                  ]}
                />
              </View>

              <View style={styles.progressLabels}>
                <Text style={styles.stopsRemainingText}>
                  {remainingStops > 0
                    ? `Encore ${remainingStops} arrêt${remainingStops > 1 ? 's' : ''}`
                    : 'Arrêt de descente atteint'}
                </Text>
                <Text style={styles.stopsPassedCount}>
                  {passedStopsCount} / {totalStops} arrêts franchis
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.walkRow}>
            <View style={styles.walkIconBox}>
              <Text style={styles.walkEmoji}>🚶</Text>
            </View>
            <View style={styles.instructionColumn}>
              <Text style={styles.instructionTitle}>
                {distanceToNextStep > 0
                  ? `Dans ${Math.round(distanceToNextStep)} m : ${currentSegment.instruction}`
                  : currentSegment.instruction}
              </Text>
              <Text style={styles.subInstruction}>
                {navState === 'WALKING_TO_STOP'
                  ? 'Bascule automatique en montant dans le véhicule (< 30 m)'
                  : 'Bascule automatique à l\'arrivée (< 25 m)'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Discreet GPS Simulation Controls for Testing/Demos */}
      <View style={styles.simControlsCard}>
        <View style={styles.simHeaderRow}>
          <Text style={styles.simTitle}>Mode Démo / Simulateur GPS</Text>
          <TouchableOpacity
            style={[styles.simButton, isSimulating && styles.simButtonActive]}
            onPress={isSimulating ? onStopSimulation : onStartSimulation}
            activeOpacity={0.7}
          >
            <Text style={styles.simButtonText}>
              {isSimulating ? '⏸ Pause simulation' : '▶ Simuler déplacement'}
            </Text>
          </TouchableOpacity>
        </View>

        {isSimulating && (
          <View style={styles.simProgressTrack}>
            <View
              style={[
                styles.simProgressBar,
                { width: `${Math.round(simulationProgress * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>

      {/* End Trip Action */}
      <TouchableOpacity
        style={styles.endButton}
        onPress={onEndTrip}
        activeOpacity={0.7}
      >
        <Text style={styles.endButtonText}>
          {navState === 'ARRIVED' ? 'Terminer la course' : 'Quitter l\'itinéraire'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 50,
  },
  dragHandleWrapper: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.borderStrong,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderWidth: 1.5,
    borderColor: '#FFA117',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  warningBannerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  warningBannerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B76E00',
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  navStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  navStateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.cassis,
  },
  arrivalTime: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  stepContent: {
    marginVertical: 10,
  },
  arrivedBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  arrivedEmoji: {
    fontSize: 40,
    marginBottom: 6,
  },
  arrivedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.success,
  },
  arrivedSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  transitContainer: {
    width: '100%',
  },
  transitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  lineCircleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  walkIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  walkEmoji: {
    fontSize: 22,
  },
  instructionColumn: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subInstruction: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  progressContainer: {
    marginTop: 12,
    backgroundColor: COLORS.surface,
    padding: 10,
    borderRadius: 10,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  stopsRemainingText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  stopsPassedCount: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  simControlsCard: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  simHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  simButton: {
    backgroundColor: '#EAEAEA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simButtonActive: {
    backgroundColor: '#FFE5EC',
  },
  simButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.cassis,
  },
  simProgressTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  simProgressBar: {
    height: '100%',
    backgroundColor: COLORS.cassis,
  },
  endButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  endButtonText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '800',
  },
});
