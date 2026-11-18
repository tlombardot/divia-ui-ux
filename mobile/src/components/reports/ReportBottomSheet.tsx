import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
  getLineColor,
} from '../../data/dijonNetwork';
import { CreateReportPayload } from '../../hooks/useReports';
import { COLORS } from '../../theme/colors';
import { CrowdLevel, TransitStop, UserLocation } from '../../types';
import { filterStationsByQuery } from '../../utils/controllerTrackingUtils';
import { getCrowdBadgeTheme } from '../../utils/crowdUtils';

interface ReportBottomSheetProps {
  visible: boolean;
  userLocation: UserLocation;
  initialStop?: TransitStop | null;
  onClose: () => void;
  onSubmitReport: (payload: CreateReportPayload) => Promise<unknown> | void;
}

const CROWD_OPTIONS: CrowdLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export const ReportBottomSheet: React.FC<ReportBottomSheetProps> = ({
  visible,
  userLocation,
  initialStop,
  onClose,
  onSubmitReport,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  // Sort stops by proximity to real user GPS
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
    initialStop || nearbyStops[0]?.stop || ALL_DIJON_STOPS[0]
  );
  const [stationSearchQuery, setStationSearchQuery] = useState<string>('');
  const [selectedLineId, setSelectedLineId] = useState<string>('ALL');
  const [selectedTerminus, setSelectedTerminus] = useState<string>('STATIONARY');
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const selectedLineObj = useMemo(
    () => DIJON_LINES.find(l => l.id === selectedLineId) || null,
    [selectedLineId]
  );

  // Sync pre-selected stop whenever modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      setConfirmationMessage(null);
      setStationSearchQuery('');
      const targetStop = initialStop || nearbyStops[0]?.stop || ALL_DIJON_STOPS[0];
      setSelectedStop(targetStop);
      const defaultLine = targetStop.lines[0] || 'ALL';
      setSelectedLineId(defaultLine);
      const lineObj = DIJON_LINES.find(l => l.id === defaultLine);
      setSelectedTerminus(lineObj ? lineObj.terminusB : 'STATIONARY');
    }
  }, [visible, initialStop, nearbyStops, translateY]);

  const handleSelectLine = (lineId: string) => {
    setSelectedLineId(lineId);
    if (lineId === 'ALL') {
      setSelectedTerminus('STATIONARY');
    } else {
      const lineObj = DIJON_LINES.find(l => l.id === lineId);
      setSelectedTerminus(lineObj ? lineObj.terminusB : 'STATIONARY');
    }
  };

  // Swipe down to dismiss gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 90 || gesture.vy > 0.65) {
          Animated.timing(translateY, {
            toValue: 500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const triggerSubmit = (type: 'CONTROLLER' | 'CROWD', crowdLevel?: CrowdLevel) => {
    Keyboard.dismiss();
    if (confirmationMessage) return;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore without haptics
    }

    const lineObj = DIJON_LINES.find(l => l.id === selectedLineId);
    const lineName =
      selectedLineId === 'ALL'
        ? 'Toutes lignes'
        : lineObj?.name || selectedLineId;

    const isFixed = selectedLineId === 'ALL' || selectedTerminus === 'STATIONARY';
    const resolvedTerminus = isFixed ? 'STATIONARY' : selectedTerminus;
    const directionLabel = isFixed
      ? `À quai (fixe) · ${selectedStop.name}`
      : `Dir. ${selectedTerminus}`;

    onSubmitReport({
      type,
      stopId: selectedStop.id,
      stopName: selectedStop.name,
      lineId: selectedLineId,
      lineName,
      latitude: selectedStop.latitude,
      longitude: selectedStop.longitude,
      direction: directionLabel,
      directionTerminus: type === 'CONTROLLER' ? resolvedTerminus : undefined,
      crowdLevel,
    });

    const msg =
      type === 'CONTROLLER'
        ? isFixed
          ? `Contrôleurs à quai signalés à ${selectedStop.name}`
          : `Suivi en direct lancé : ${selectedLineId} dir. ${selectedTerminus}`
        : `Merci ! Affluence "${getCrowdBadgeTheme(crowdLevel!).label}" partagée`;

    setConfirmationMessage(msg);

    setTimeout(() => {
      setConfirmationMessage(null);
      onClose();
    }, 1150);
  };

  // Searchable station list across ALL network stations (T1..B13)
  const carouselStops = useMemo(() => {
    const trimmed = stationSearchQuery.trim();
    if (trimmed.length > 0) {
      const matched = filterStationsByQuery(ALL_DIJON_STOPS, trimmed);
      return matched
        .map(stop => ({
          stop,
          dist: calculateDistanceMeters(
            userLocation.latitude,
            userLocation.longitude,
            stop.latitude,
            stop.longitude
          ),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 12);
    }

    const topNearby = nearbyStops.slice(0, 8);
    if (topNearby.some(item => item.stop.id === selectedStop.id)) {
      return topNearby;
    }
    const dist = calculateDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      selectedStop.latitude,
      selectedStop.longitude
    );
    return [{ stop: selectedStop, dist }, ...topNearby.slice(0, 7)];
  }, [nearbyStops, selectedStop, stationSearchQuery, userLocation.latitude, userLocation.longitude]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom + 8, 22),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Swipeable Drag Handle */}
          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.dragHandle} />
          </View>

          {/* Animated Confirmation State */}
          {confirmationMessage ? (
            <View style={styles.confirmView}>
              <View style={styles.confirmCircle}>
                <Text style={styles.confirmCheck}>✓</Text>
              </View>
              <Text style={styles.confirmTitle}>Merci, la communauté Dijon est prévenue !</Text>
              <Text style={styles.confirmSub}>{confirmationMessage}</Text>
            </View>
          ) : (
            <>
              {/* Contextual Station Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerTexts}>
                  <Text style={styles.kicker}>SIGNALEMENT EN 1 TAP</Text>
                  <Text style={styles.stationHeadline} numberOfLines={1}>
                    📍 {selectedStop.name}
                  </Text>
                </View>

                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* All-Network Station Search Input (Tram, Liane, Bus B10/B12/B13) */}
              <View style={styles.stationSearchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.stationSearchInput}
                  placeholder="Rechercher n'importe quelle station (Darcy, Ahuy, Chicago...)"
                  placeholderTextColor="#70757A"
                  value={stationSearchQuery}
                  onChangeText={setStationSearchQuery}
                  autoCorrect={false}
                />
                {stationSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setStationSearchQuery('')}
                    style={styles.searchClearBtn}
                  >
                    <Text style={styles.searchClearText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Nearby / Search Results Stops Quick Switcher Carousel */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stopsCarousel}
                style={styles.carouselWrapper}
                keyboardShouldPersistTaps="handled"
              >
                {carouselStops.map(({ stop, dist }) => {
                  const active = stop.id === selectedStop.id;
                  return (
                    <TouchableOpacity
                      key={stop.id}
                      style={[styles.stopChip, active && styles.stopChipActive]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSelectedStop(stop);
                        if (selectedLineId !== 'ALL' && !stop.lines.includes(selectedLineId)) {
                          handleSelectLine(stop.lines[0] || 'ALL');
                        }
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.stopChipName,
                          active && styles.stopChipNameActive,
                        ]}
                      >
                        {stop.name}
                      </Text>
                      <Text
                        style={[
                          styles.stopChipDist,
                          active && styles.stopChipDistActive,
                        ]}
                      >
                        {stop.lines.slice(0, 3).join('·')} ·{' '}
                        {dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Colored Line Selector Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.linesRow}
                style={styles.linesWrapper}
              >
                <TouchableOpacity
                  style={[
                    styles.allLinesPill,
                    selectedLineId === 'ALL' && styles.allLinesPillActive,
                  ]}
                  onPress={() => handleSelectLine('ALL')}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.allLinesText,
                      selectedLineId === 'ALL' && styles.allLinesTextActive,
                    ]}
                  >
                    Toutes lignes
                  </Text>
                </TouchableOpacity>

                {selectedStop.lines.map(lineId => {
                  const active = selectedLineId === lineId;
                  const bg = getLineColor(lineId);
                  return (
                    <TouchableOpacity
                      key={lineId}
                      style={[
                        styles.linePill,
                        { backgroundColor: bg },
                        active && styles.linePillActive,
                      ]}
                      onPress={() => handleSelectLine(lineId)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.linePillText}>{lineId}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 1-Tap Direction (Terminus) Selector for Predictive Stop-by-Stop Tracking */}
              {selectedLineObj && (
                <View style={styles.directionSection}>
                  <Text style={styles.directionSectionLabel}>
                    Direction (suivi en direct arrêt par arrêt)
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.directionRow}
                  >
                    <TouchableOpacity
                      style={[
                        styles.dirChip,
                        selectedTerminus === selectedLineObj.terminusB && styles.dirChipActive,
                      ]}
                      onPress={() => setSelectedTerminus(selectedLineObj.terminusB)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dirChipText,
                          selectedTerminus === selectedLineObj.terminusB &&
                            styles.dirChipTextActive,
                        ]}
                      >
                        → Dir. {selectedLineObj.terminusB}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dirChip,
                        selectedTerminus === selectedLineObj.terminusA && styles.dirChipActive,
                      ]}
                      onPress={() => setSelectedTerminus(selectedLineObj.terminusA)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dirChipText,
                          selectedTerminus === selectedLineObj.terminusA &&
                            styles.dirChipTextActive,
                        ]}
                      >
                        → Dir. {selectedLineObj.terminusA}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dirChip,
                        selectedTerminus === 'STATIONARY' && styles.dirChipActive,
                      ]}
                      onPress={() => setSelectedTerminus('STATIONARY')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dirChipText,
                          selectedTerminus === 'STATIONARY' && styles.dirChipTextActive,
                        ]}
                      >
                        📍 À quai (fixe)
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}

              {/* =========================================================== */}
              {/* BLOC 1 — CONTRÔLEURS (1-Tap Divia Cassis Action Card)       */}
              {/* =========================================================== */}
              <Text style={styles.blockLabel}>Sécurité & Contrôle</Text>
              <TouchableOpacity
                style={styles.controllerCard}
                onPress={() => triggerSubmit('CONTROLLER')}
                activeOpacity={0.85}
              >
                <View style={styles.shieldCircle}>
                  <Text style={styles.shieldEmoji}>🛡️</Text>
                </View>
                <View style={styles.controllerTexts}>
                  <Text style={styles.controllerTitle}>
                    {selectedLineId !== 'ALL' && selectedTerminus !== 'STATIONARY'
                      ? `Contrôleurs à bord (${selectedLineId} → ${selectedTerminus})`
                      : `Contrôleurs présents à ${selectedStop.name}`}
                  </Text>
                  <Text style={styles.controllerSub}>
                    {selectedLineId !== 'ALL' && selectedTerminus !== 'STATIONARY'
                      ? 'Suivi prédictif arrêt par arrêt · Suppression auto au terminus'
                      : 'Contrôle fixe à quai · Diffusion instantanée (35 min)'}
                  </Text>
                </View>
                <Text style={styles.controllerArrow}>›</Text>
              </TouchableOpacity>

              {/* =========================================================== */}
              {/* BLOC 2 — AFFLUENCE EN DIRECT (3 Large Colored 1-Tap Cards)  */}
              {/* =========================================================== */}
              <Text style={styles.blockLabel}>Affluence en direct à quai / à bord</Text>
              <View style={styles.crowdGrid}>
                {CROWD_OPTIONS.map(level => {
                  const theme = getCrowdBadgeTheme(level);
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.crowdTile,
                        {
                          backgroundColor: theme.bgColor,
                          borderColor: theme.borderColor,
                        },
                      ]}
                      onPress={() => triggerSubmit('CROWD', level)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.crowdTileIcon}>{theme.icon}</Text>
                      <Text style={[styles.crowdTileLabel, { color: theme.color }]}>
                        {theme.label}
                      </Text>
                      <Text style={styles.crowdTileDesc}>{theme.shortDesc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 12, 16, 0.48)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 16,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D0D3D6',
  },
  confirmView: {
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 16,
  },
  confirmCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00875A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmCheck: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#202124',
    textAlign: 'center',
  },
  confirmSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTexts: {
    flex: 1,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.magenta,
    letterSpacing: 0.8,
  },
  stationHeadline: {
    fontSize: 20,
    fontWeight: '900',
    color: '#202124',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5F6368',
  },
  stationSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F4',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  stationSearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#202124',
    padding: 0,
  },
  searchClearBtn: {
    padding: 4,
  },
  searchClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#70757A',
  },
  directionSection: {
    marginBottom: 12,
  },
  directionSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F6368',
    marginBottom: 6,
  },
  directionRow: {
    gap: 8,
  },
  dirChip: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  dirChipActive: {
    backgroundColor: '#FFF0F6',
    borderColor: COLORS.cassis,
  },
  dirChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C4043',
  },
  dirChipTextActive: {
    color: COLORS.cassis,
    fontWeight: '800',
  },
  carouselWrapper: {
    marginBottom: 10,
  },
  stopsCarousel: {
    gap: 8,
  },
  stopChip: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  stopChipActive: {
    backgroundColor: '#FFF0F6',
    borderColor: COLORS.cassis,
  },
  stopChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202124',
  },
  stopChipNameActive: {
    color: COLORS.cassis,
    fontWeight: '800',
  },
  stopChipDist: {
    fontSize: 10,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 1,
  },
  stopChipDistActive: {
    color: COLORS.magenta,
  },
  linesWrapper: {
    marginBottom: 14,
  },
  linesRow: {
    gap: 8,
    alignItems: 'center',
  },
  allLinesPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  allLinesPillActive: {
    backgroundColor: '#202124',
  },
  allLinesText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C4043',
  },
  allLinesTextActive: {
    color: '#FFFFFF',
  },
  linePill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    opacity: 0.45,
  },
  linePillActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#202124',
  },
  linePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5F6368',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  controllerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cassis,
    borderRadius: 18,
    padding: 15,
    marginBottom: 16,
    shadowColor: COLORS.cassis,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  shieldCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  shieldEmoji: {
    fontSize: 22,
  },
  controllerTexts: {
    flex: 1,
  },
  controllerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  controllerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8D4E2',
    marginTop: 2,
  },
  controllerArrow: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginLeft: 6,
  },
  crowdGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  crowdTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  crowdTileIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  crowdTileLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  crowdTileDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 2,
    textAlign: 'center',
  },
});
