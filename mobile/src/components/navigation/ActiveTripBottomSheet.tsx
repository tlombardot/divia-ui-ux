import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/colors';
import { RouteOption } from '../../types';

interface ActiveTripBottomSheetProps {
  route: RouteOption;
  currentStepIndex: number;
  onNextStep: () => void;
  onEndTrip: () => void;
}

export const ActiveTripBottomSheet: React.FC<ActiveTripBottomSheetProps> = ({
  route,
  currentStepIndex,
  onNextStep,
  onEndTrip,
}) => {
  const insets = useSafeAreaInsets();
  const currentStep = route.steps[currentStepIndex];
  const isLastStep = currentStepIndex >= route.steps.length - 1;

  if (!currentStep) return null;

  return (
    <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Drag handle */}
      <View style={styles.dragHandleWrapper}>
        <View style={styles.dragHandle} />
      </View>

      {/* Progress indicators */}
      <View style={styles.headerRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>
            Étape {currentStepIndex + 1} / {route.steps.length}
          </Text>
        </View>
        <Text style={styles.arrivalTime}>Arrivée estimée : {route.arrivalTime}</Text>
      </View>

      {/* Current Step Content */}
      <View style={styles.stepContent}>
        {currentStep.type === 'transit' ? (
          <View style={styles.transitRow}>
            <View
              style={[
                styles.lineCircle,
                { backgroundColor: currentStep.lineColor || COLORS.cassis },
              ]}
            >
              <Text style={styles.lineCircleText}>{currentStep.lineId}</Text>
            </View>
            <View style={styles.instructionColumn}>
              <Text style={styles.instructionTitle}>{currentStep.instruction}</Text>
              {currentStep.toStop && (
                <Text style={styles.subInstruction}>
                  Descendre à l'arrêt {currentStep.toStop.name}
                  {currentStep.stopsCount ? ` (${currentStep.stopsCount} arrêts)` : ''}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.walkRow}>
            <View style={styles.walkIconBox}>
              <Text style={styles.walkEmoji}>🚶</Text>
            </View>
            <View style={styles.instructionColumn}>
              <Text style={styles.instructionTitle}>{currentStep.instruction}</Text>
              <Text style={styles.subInstruction}>
                ~{currentStep.durationMinutes} min de marche ({currentStep.distanceMeters} m)
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={styles.nextStepButton}
          onPress={onNextStep}
          activeOpacity={0.8}
        >
          <Text style={styles.nextStepText}>
            {isLastStep ? 'Terminer l\'itinéraire' : 'Arrêt suivant'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endButton}
          onPress={onEndTrip}
          activeOpacity={0.7}
        >
          <Text style={styles.endButtonText}>Quitter</Text>
        </TouchableOpacity>
      </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  stepBadge: {
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cassis,
  },
  arrivalTime: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  stepContent: {
    marginVertical: 12,
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
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subInstruction: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  nextStepButton: {
    flex: 2,
    backgroundColor: COLORS.cassis,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextStepText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  endButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  endButtonText: {
    color: COLORS.error,
    fontSize: 15,
    fontWeight: '700',
  },
});
