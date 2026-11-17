import { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_DIJON_STOPS, calculateDistanceMeters, DIJON_LINES } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { TransitStop, UserLocation } from '../../types';

interface ReportModalProps {
  visible: boolean;
  userLocation: UserLocation;
  onClose: () => void;
  onSubmitReport: (payload: {
    stopId: string;
    stopName: string;
    lineId: string;
    lineName: string;
    latitude: number;
    longitude: number;
    direction: string;
    description?: string;
  }) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  visible,
  userLocation,
  onClose,
  onSubmitReport,
}) => {
  const insets = useSafeAreaInsets();

  // Sort stops by distance to user
  const nearbyStops = useMemo(() => {
    return [...ALL_DIJON_STOPS]
      .map(stop => ({
        stop,
        dist: calculateDistanceMeters(
          userLocation.latitude,
          userLocation.longitude,
          stop.latitude,
          stop.longitude
        ),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [userLocation.latitude, userLocation.longitude]);

  const [selectedStop, setSelectedStop] = useState<TransitStop>(
    nearbyStops[0]?.stop || ALL_DIJON_STOPS[0]
  );
  const [selectedLineId, setSelectedLineId] = useState<string>('T1');
  const [direction, setDirection] = useState<string>('Direction Quetigny Centre');
  const [description, setDescription] = useState<string>('');

  const handleLineSelect = (lineId: string) => {
    setSelectedLineId(lineId);
    if (lineId === 'T1') setDirection('Direction Quetigny Centre');
    else if (lineId === 'T2') setDirection('Direction Chenôve Centre');
    else setDirection('Direction Université');
  };

  const handleSubmit = () => {
    const line = DIJON_LINES.find(l => l.id === selectedLineId);
    onSubmitReport({
      stopId: selectedStop.id,
      stopName: selectedStop.name,
      lineId: selectedLineId,
      lineName: line?.name || selectedLineId,
      latitude: selectedStop.latitude,
      longitude: selectedStop.longitude,
      direction,
      description: description.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Drag Handle */}
          <View style={styles.dragHandleWrapper}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🚨 Signaler un contrôle</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionSubtitle}>
            1. Choisissez l'arrêt (trié par proximité) :
          </Text>

          {/* Nearby Stops List */}
          <View style={styles.stopsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {nearbyStops.slice(0, 7).map(({ stop, dist }) => {
                const isSelected = selectedStop.id === stop.id;
                return (
                  <TouchableOpacity
                    key={stop.id}
                    style={[styles.stopChip, isSelected && styles.stopChipSelected]}
                    onPress={() => setSelectedStop(stop)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.stopChipText,
                        isSelected && styles.stopChipTextSelected,
                      ]}
                    >
                      {stop.name}
                    </Text>
                    <Text
                      style={[
                        styles.stopChipDist,
                        isSelected && styles.stopChipDistSelected,
                      ]}
                    >
                      {dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <Text style={styles.sectionSubtitle}>2. Ligne concernée :</Text>
          <View style={styles.linesRow}>
            {DIJON_LINES.map(line => {
              const isSelected = selectedLineId === line.id;
              return (
                <TouchableOpacity
                  key={line.id}
                  style={[
                    styles.lineBtn,
                    { backgroundColor: line.color },
                    isSelected && styles.lineBtnSelected,
                  ]}
                  onPress={() => handleLineSelect(line.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.lineBtnText}>{line.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionSubtitle}>3. Détails (facultatif) :</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ex: 2 contrôleurs quai tram, en uniforme..."
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            maxLength={140}
          />

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmButtonText}>
              Publier le signalement (TTL 40 min)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  stopsContainer: {
    flexDirection: 'row',
  },
  stopChip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  stopChipSelected: {
    backgroundColor: '#FFF2F6',
    borderColor: COLORS.cassis,
  },
  stopChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  stopChipTextSelected: {
    color: COLORS.cassis,
  },
  stopChipDist: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  stopChipDistSelected: {
    color: COLORS.cassis,
  },
  linesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  lineBtn: {
    width: 60,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  lineBtnSelected: {
    opacity: 1,
    borderWidth: 2.5,
    borderColor: '#141414',
  },
  lineBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: COLORS.cassis,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
});
