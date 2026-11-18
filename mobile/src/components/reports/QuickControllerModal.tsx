import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_DIJON_STOPS, getLineColor } from '../../data/dijonNetwork';
import { CreateReportPayload } from '../../hooks/useReports';
import { COLORS } from '../../theme/colors';
import { TransitStop, UserLocation } from '../../types';
import { filterStationsByQuery } from '../../utils/controllerTrackingUtils';
import {
  AKHAAA_REPORT_LABELS,
  buildQuickControllerPayload,
  getNearestStops,
  resolveDefaultLineId,
} from '../../utils/quickReportUtils';

export interface QuickControllerModalProps {
  visible: boolean;
  userLocation: UserLocation;
  initialStop?: TransitStop | null;
  onClose: () => void;
  onSubmitReport: (payload: CreateReportPayload) => Promise<unknown> | void;
}

export const QuickControllerModal: React.FC<QuickControllerModalProps> = ({
  visible,
  userLocation,
  initialStop,
  onClose,
  onSubmitReport,
}) => {
  const insets = useSafeAreaInsets();

  // 1. Calculate nearest stops from user coordinates
  const nearbyList = useMemo(() => {
    return getNearestStops(userLocation.latitude, userLocation.longitude, ALL_DIJON_STOPS, 8);
  }, [userLocation.latitude, userLocation.longitude]);

  // 2. Component state
  const [selectedStop, setSelectedStop] = useState<TransitStop>(
    initialStop || nearbyList[0]?.stop || ALL_DIJON_STOPS[0]
  );
  const [selectedLineId, setSelectedLineId] = useState<string>('ALL');
  const [isChangingStop, setIsChangingStop] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 3. Reset or initialize whenever the modal becomes visible
  useEffect(() => {
    if (visible) {
      setIsSubmitted(false);
      setIsSubmitting(false);
      setIsChangingStop(false);
      setSearchQuery('');

      const target = initialStop || nearbyList[0]?.stop || ALL_DIJON_STOPS[0];
      setSelectedStop(target);
      const defaultLine = resolveDefaultLineId(target);
      setSelectedLineId(defaultLine);
    }
  }, [visible, initialStop, nearbyList]);

  // 4. Compute distance to selected stop
  const selectedStopMeta = useMemo(() => {
    const found = nearbyList.find(item => item.stop.id === selectedStop.id);
    if (found) return found;
    const computed = getNearestStops(
      userLocation.latitude,
      userLocation.longitude,
      [selectedStop],
      1
    );
    return computed[0];
  }, [nearbyList, selectedStop, userLocation.latitude, userLocation.longitude]);

  // 5. Filtered list for stop change (search or top nearby)
  const availableStopChoices = useMemo(() => {
    const query = searchQuery.trim();
    if (query.length > 0) {
      const filtered = filterStationsByQuery(ALL_DIJON_STOPS, query);
      return getNearestStops(
        userLocation.latitude,
        userLocation.longitude,
        filtered,
        8
      );
    }
    return nearbyList;
  }, [searchQuery, nearbyList, userLocation.latitude, userLocation.longitude]);

  // 6. Handle stop selection
  const handleSelectStop = (stop: TransitStop) => {
    Keyboard.dismiss();
    setSelectedStop(stop);
    setIsChangingStop(false);
    setSearchQuery('');
    const bestLine = resolveDefaultLineId(stop);
    setSelectedLineId(bestLine);
  };

  // 7. Handle 1-tap submission
  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (isSubmitting || isSubmitted) return;
    setIsSubmitting(true);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore if haptics unavailable in environment
    }

    const payload = buildQuickControllerPayload(selectedStop, selectedLineId);
    await onSubmitReport(payload);

    setIsSubmitted(true);
    setIsSubmitting(false);

    // Auto-close after 1 second of confirmation display
    setTimeout(() => {
      onClose();
    }, 1100);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={isSubmitted ? undefined : onClose}
        />

        <View
          style={[
            styles.cardContainer,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          {/* Top Grab Indicator */}
          <View style={styles.dragHandle} />

          {isSubmitted ? (
            /* Success Feedback View */
            <View style={styles.successBox}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkIcon}>✓</Text>
              </View>
              <Text style={styles.successTitle}>{AKHAAA_REPORT_LABELS.successTitle}</Text>
              <Text style={styles.successSub}>
                La communauté Dijonnaise est prévenue à l'arrêt {selectedStop.name}.
              </Text>
              <View style={styles.ttlBadge}>
                <Text style={styles.ttlBadgeText}>⏱ Actif 40 minutes</Text>
              </View>
            </View>
          ) : (
            <>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.badgeKicker}>
                    <Text style={styles.badgeKickerText}>
                      {AKHAAA_REPORT_LABELS.modalKicker}
                    </Text>
                  </View>
                  <Text style={styles.title}>{AKHAAA_REPORT_LABELS.modalTitle}</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Detected Stop Banner */}
              <View style={styles.stopCard}>
                <View style={styles.stopInfoRow}>
                  <View style={styles.stopIconWrapper}>
                    <Text style={styles.stopPinIcon}>📍</Text>
                  </View>
                  <View style={styles.stopTexts}>
                    <Text style={styles.stopDetectedLabel}>ARRÊT DÉTECTÉ PAR GÉOLOC</Text>
                    <Text style={styles.stopName} numberOfLines={1}>
                      {selectedStop.name}
                    </Text>
                    <Text style={styles.stopDistance}>
                      à {selectedStopMeta?.formattedDistance || 'quelques mètres'} de vous
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changeStopBtn}
                    onPress={() => setIsChangingStop(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changeStopBtnText}>
                      {isChangingStop ? 'Fermer' : 'Changer ✎'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Inline Stop Picker (revealed if GPS was slightly off) */}
                {isChangingStop && (
                  <View style={styles.pickerExpandedSection}>
                    <View style={styles.searchBar}>
                      <Text style={styles.searchIcon}>🔍</Text>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher un arrêt (Darcy, Gare...)"
                        placeholderTextColor={COLORS.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCorrect={false}
                        autoFocus
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setSearchQuery('')}
                          style={styles.searchClear}
                        >
                          <Text style={styles.searchClearText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={styles.suggestionTitle}>
                      {searchQuery.trim().length > 0
                        ? 'Résultats de recherche :'
                        : 'Arrêts les plus proches :'}
                    </Text>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.suggestionScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {availableStopChoices.map(item => {
                        const isCurrent = item.stop.id === selectedStop.id;
                        return (
                          <TouchableOpacity
                            key={item.stop.id}
                            style={[
                              styles.suggestionChip,
                              isCurrent && styles.suggestionChipActive,
                            ]}
                            onPress={() => handleSelectStop(item.stop)}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={[
                                styles.suggestionChipName,
                                isCurrent && styles.suggestionChipNameActive,
                              ]}
                            >
                              {item.stop.name}
                            </Text>
                            <Text
                              style={[
                                styles.suggestionChipDist,
                                isCurrent && styles.suggestionChipDistActive,
                              ]}
                            >
                              {item.formattedDistance}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Line Selector (Compact Pills) */}
              <View style={styles.linesSection}>
                <Text style={styles.sectionLabel}>Ligne concernée :</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.linesRow}
                >
                  <TouchableOpacity
                    style={[
                      styles.linePill,
                      selectedLineId === 'ALL' && styles.linePillActiveAll,
                    ]}
                    onPress={() => setSelectedLineId('ALL')}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.linePillText,
                        selectedLineId === 'ALL' && styles.linePillTextActive,
                      ]}
                    >
                      À quai (toutes lignes)
                    </Text>
                  </TouchableOpacity>

                  {selectedStop.lines.map(lineId => {
                    const active = selectedLineId === lineId;
                    const bg = getLineColor(lineId);
                    return (
                      <TouchableOpacity
                        key={lineId}
                        style={[
                          styles.linePillColor,
                          { backgroundColor: bg },
                          active && styles.linePillColorActive,
                        ]}
                        onPress={() => setSelectedLineId(lineId)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.linePillColorText}>{lineId}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Big 1-Tap CTA Action Button */}
              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonIcon}>🚨</Text>
                <View style={styles.primaryButtonTexts}>
                  <Text style={styles.primaryButtonTitle}>
                    {AKHAAA_REPORT_LABELS.ctaTitle}
                  </Text>
                  <Text style={styles.primaryButtonSub}>
                    {AKHAAA_REPORT_LABELS.ctaSubtitle}
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 12, 16, 0.55)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 20,
  },
  dragHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D0D3D6',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
  },
  badgeKicker: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  badgeKickerText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cassis,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#202124',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5F6368',
  },
  stopCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    marginBottom: 14,
  },
  stopInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  stopPinIcon: {
    fontSize: 20,
  },
  stopTexts: {
    flex: 1,
  },
  stopDetectedLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5F6368',
    letterSpacing: 0.6,
  },
  stopName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#202124',
    marginTop: 1,
  },
  stopDistance: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cassis,
    marginTop: 1,
  },
  changeStopBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D3D6',
  },
  changeStopBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3C4043',
  },
  pickerExpandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D3D6',
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#202124',
    padding: 0,
  },
  searchClear: {
    padding: 4,
  },
  searchClearText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#70757A',
  },
  suggestionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F6368',
    marginBottom: 6,
  },
  suggestionScroll: {
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  suggestionChipActive: {
    backgroundColor: '#FFF0F5',
    borderColor: COLORS.cassis,
  },
  suggestionChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202124',
  },
  suggestionChipNameActive: {
    color: COLORS.cassis,
    fontWeight: '800',
  },
  suggestionChipDist: {
    fontSize: 10,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 1,
  },
  suggestionChipDistActive: {
    color: COLORS.cassis,
  },
  linesSection: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5F6368',
    marginBottom: 8,
  },
  linesRow: {
    gap: 8,
    alignItems: 'center',
  },
  linePill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  linePillActiveAll: {
    backgroundColor: '#202124',
  },
  linePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C4043',
  },
  linePillTextActive: {
    color: '#FFFFFF',
  },
  linePillColor: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    opacity: 0.45,
  },
  linePillColorActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#202124',
  },
  linePillColorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cassis,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: COLORS.cassis,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonIcon: {
    fontSize: 26,
    marginRight: 12,
  },
  primaryButtonTexts: {
    flex: 1,
  },
  primaryButtonTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  primaryButtonSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8D4E2',
    marginTop: 2,
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00875A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#202124',
  },
  successSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  ttlBadge: {
    marginTop: 14,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  ttlBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00875A',
  },
});
