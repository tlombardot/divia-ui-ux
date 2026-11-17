import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
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
  const [selectedLineId, setSelectedLineId] = useState<string>('ALL');
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  // Sync pre-selected stop whenever modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      setConfirmationMessage(null);
      const targetStop = initialStop || nearbyStops[0]?.stop || ALL_DIJON_STOPS[0];
      setSelectedStop(targetStop);
      setSelectedLineId(targetStop.lines.length === 1 ? targetStop.lines[0] : 'ALL');
    }
  }, [visible, initialStop, nearbyStops, translateY]);

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

    onSubmitReport({
      type,
      stopId: selectedStop.id,
      stopName: selectedStop.name,
      lineId: selectedLineId,
      lineName,
      latitude: selectedStop.latitude,
      longitude: selectedStop.longitude,
      direction:
        selectedLineId === 'ALL'
          ? `Station ${selectedStop.name}`
          : `Ligne ${selectedLineId} · ${selectedStop.name}`,
      crowdLevel,
    });

    const msg =
      type === 'CONTROLLER'
        ? `Merci ! Contrôleurs signalés à ${selectedStop.name}`
        : `Merci ! Affluence "${getCrowdBadgeTheme(crowdLevel!).label}" partagée`;

    setConfirmationMessage(msg);

    setTimeout(() => {
      setConfirmationMessage(null);
      onClose();
    }, 1150);
  };

  // Ensure selected stop is always first in the carousel
  const carouselStops = useMemo(() => {
    const topNearby = nearbyStops.slice(0, 7);
    if (topNearby.some(item => item.stop.id === selectedStop.id)) {
      return topNearby;
    }
    const dist = calculateDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      selectedStop.latitude,
      selectedStop.longitude
    );
    return [{ stop: selectedStop, dist }, ...topNearby.slice(0, 6)];
  }, [nearbyStops, selectedStop, userLocation.latitude, userLocation.longitude]);

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

              {/* Nearby Stops Quick Switcher Carousel */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stopsCarousel}
                style={styles.carouselWrapper}
              >
                {carouselStops.map(({ stop, dist }) => {
                  const active = stop.id === selectedStop.id;
                  return (
                    <TouchableOpacity
                      key={stop.id}
                      style={[styles.stopChip, active && styles.stopChipActive]}
                      onPress={() => {
                        setSelectedStop(stop);
                        if (selectedLineId !== 'ALL' && !stop.lines.includes(selectedLineId)) {
                          setSelectedLineId('ALL');
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
                        {dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Optional Colored Line Selector Pills */}
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
                  onPress={() => setSelectedLineId('ALL')}
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
                      onPress={() => setSelectedLineId(lineId)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.linePillText}>{lineId}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

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
                    Contrôleurs présents à cet arrêt
                  </Text>
                  <Text style={styles.controllerSub}>
                    Diffusion instantanée · Expire automatiquement (40 min)
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
