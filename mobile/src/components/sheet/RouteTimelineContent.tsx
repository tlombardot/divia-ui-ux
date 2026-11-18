import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getLineColor } from '../../data/dijonNetwork';
import { RouteOption } from '../../types';
import { getCrowdBadgeTheme } from '../../utils/crowdUtils';
import { getTransitIntermediateDisplayModel } from '../../utils/routeTimelineUtils';

interface RouteTimelineContentProps {
  route: RouteOption;
  originLabel: string;
  destinationLabel: string;
  onBackToList: () => void;
}

export const RouteTimelineContent: React.FC<RouteTimelineContentProps> = ({
  route,
  originLabel,
  destinationLabel,
  onBackToList,
}) => {
  const [expandedSegments, setExpandedSegments] = useState<Record<number, boolean>>({});

  const toggleSegmentAccordion = (idx: number) => {
    setExpandedSegments(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <View style={styles.container}>
      {/* Top Timeline Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBackToList}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTexts}>
          <Text style={styles.headerDuration}>
            {route.totalDurationMinutes} min{' '}
            <Text style={styles.headerArrival}>· Arrivée {route.arrivalTime}</Text>
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {route.summary}
            {route.headwayMinutes ? ` · Toutes les ${route.headwayMinutes} min` : ''}
          </Text>
        </View>
      </View>

      {/* Scrollable Vertical Timeline */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Controller Alert Banner if active */}
        {route.hasControllerAlert && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertIcon}>🚨</Text>
            <View style={styles.alertTexts}>
              <Text style={styles.alertTitle}>Alerte contrôleurs Waze sur cet itinéraire</Text>
              {route.alerts.map(a => (
                <Text key={a.id} style={styles.alertSub}>
                  • {a.stopName} ({a.lineId}) — {a.direction}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Origin Node */}
        <View style={styles.nodeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.timeStrong}>{route.departureTime}</Text>
          </View>
          <View style={styles.railCol}>
            <View style={styles.originDot} />
            <View style={styles.dashedConnector} />
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.nodeTitle}>{originLabel}</Text>
            <Text style={styles.nodeSub}>Point de départ</Text>
          </View>
        </View>

        {/* Segments Loop */}
        {route.segments.map((seg, idx) => {
          const isExpanded = Boolean(expandedSegments[idx]);

          // ===================================================================
          // WALK Segment (Dashed rail + Expandable street-by-street instructions)
          // ===================================================================
          if (seg.type === 'WALK') {
            const detailedSteps =
              seg.instructions && seg.instructions.length > 0
                ? seg.instructions
                : seg.turnInstructions || [];
            const hasMultipleSteps = detailedSteps.length > 1;

            return (
              <View key={`seg-walk-${idx}`} style={styles.segmentBlock}>
                <View style={styles.nodeRow}>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeMuted}>{seg.durationMinutes} min</Text>
                  </View>
                  <View style={styles.railCol}>
                    <View style={styles.walkIconBadge}>
                      <Text style={styles.walkEmoji}>🚶</Text>
                    </View>
                    <View style={styles.dashedConnectorTall} />
                  </View>
                  <View style={styles.infoCol}>
                    <Text style={styles.walkTitle}>{seg.instruction}</Text>
                    <Text style={styles.walkMeta}>
                      À pied · {seg.distanceMeters} m ({seg.durationMinutes} min)
                    </Text>

                    {/* Expandable street-by-street detailed walking steps */}
                    {hasMultipleSteps ? (
                      <>
                        <TouchableOpacity
                          style={styles.accordionBtn}
                          onPress={() => toggleSegmentAccordion(idx)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.accordionText, { color: '#1A73E8' }]}>
                            {isExpanded
                              ? 'Masquer le détail rue par rue ⌃'
                              : `Voir les ${detailedSteps.length} étapes à pied ⌄`}
                          </Text>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.turnsBox}>
                            {detailedSteps.map((instr, tIdx) => (
                              <View key={tIdx} style={styles.turnRow}>
                                <Text style={styles.turnArrow}>↱</Text>
                                <Text style={styles.turnText}>{instr}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    ) : detailedSteps.length === 1 && detailedSteps[0] !== seg.instruction ? (
                      <View style={styles.turnsBox}>
                        <View style={styles.turnRow}>
                          <Text style={styles.turnArrow}>↱</Text>
                          <Text style={styles.turnText}>{detailedSteps[0]}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }

          // ===================================================================
          // TRANSFER Segment
          // ===================================================================
          if (seg.type === 'TRANSFER') {
            return (
              <View key={`seg-transfer-${idx}`} style={styles.segmentBlock}>
                <View style={styles.nodeRow}>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeMuted}>{seg.durationMinutes} min</Text>
                  </View>
                  <View style={styles.railCol}>
                    <View style={styles.transferBadge}>
                      <Text style={styles.transferEmoji}>🔄</Text>
                    </View>
                    <View style={styles.dashedConnector} />
                  </View>
                  <View style={styles.infoCol}>
                    <Text style={styles.transferTitle}>{seg.instruction}</Text>
                    <Text style={styles.nodeSub}>
                      Correspondance quai à quai ({seg.distanceMeters} m)
                    </Text>
                  </View>
                </View>
              </View>
            );
          }

          // ===================================================================
          // TRANSIT Segment (5px Colored Bar + Filled/Ringed Stops + Accordion)
          // ===================================================================
          const lineColor = seg.lineColor || getLineColor(seg.lineId || 'T1');
          const stopTimes = seg.estimatedStopTimes || [];
          const intermediateDisplay = getTransitIntermediateDisplayModel(seg, route.alerts);

          return (
            <View key={`seg-transit-${idx}`} style={styles.segmentBlock}>
              {/* Boarding Stop (Filled Circle) */}
              <View style={styles.nodeRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeStrong}>
                    {seg.departureTime || stopTimes[0] || ''}
                  </Text>
                </View>
                <View style={styles.railCol}>
                  <View
                    style={[
                      styles.boardingCircleFilled,
                      { backgroundColor: lineColor },
                    ]}
                  />
                  <View
                    style={[styles.thickTransitBar, { backgroundColor: lineColor }]}
                  />
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.stopBoldTitle}>
                    {seg.fromStop?.name || 'Arrêt de montée'}
                  </Text>
                  <View style={styles.transitBadgeRow}>
                    <View
                      style={[styles.linePill, { backgroundColor: lineColor }]}
                    >
                      <Text style={styles.linePillText}>{seg.lineId}</Text>
                    </View>
                    <Text style={styles.directionText} numberOfLines={1}>
                      {seg.direction || seg.lineName}
                    </Text>
                  </View>

                  {seg.crowdStatus && (
                    <View
                      style={[
                        styles.timelineCrowdBadge,
                        {
                          backgroundColor: getCrowdBadgeTheme(seg.crowdStatus.level).bgColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timelineCrowdText,
                          { color: getCrowdBadgeTheme(seg.crowdStatus.level).color },
                        ]}
                      >
                        {getCrowdBadgeTheme(seg.crowdStatus.level).icon}{' '}
                        {seg.crowdStatus.label} · {seg.crowdStatus.description}
                        {seg.crowdStatus.source === 'community' ? ' (vérifié)' : ''}
                      </Text>
                    </View>
                  )}

                  {/* Systematic Accordion when intermediate stops are resolved */}
                  {intermediateDisplay.mode === 'accordion' && (
                    <TouchableOpacity
                      style={styles.accordionBtn}
                      onPress={() => toggleSegmentAccordion(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.accordionText, { color: lineColor }]}>
                        {isExpanded
                          ? intermediateDisplay.expandedLabel
                          : intermediateDisplay.collapsedLabel}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* UI Safety Net: uncatalogued secondary line with stopCount > 1 */}
                  {intermediateDisplay.mode === 'fallback_info' &&
                    intermediateDisplay.fallbackLabel && (
                      <Text style={styles.fallbackStopsInfo}>
                        {intermediateDisplay.fallbackLabel} · {seg.durationMinutes} min
                      </Text>
                    )}

                  {/* Adjacent direct hop (no intermediate stops) */}
                  {intermediateDisplay.mode === 'direct' && (
                    <Text style={styles.fallbackStopsInfo}>
                      Trajet direct ({seg.durationMinutes} min)
                    </Text>
                  )}
                </View>
              </View>

              {/* Expanded Intermediate Stations aligned directly on the colored vertical line */}
              {isExpanded &&
                intermediateDisplay.mode === 'accordion' &&
                intermediateDisplay.intermediateStops.map(st => (
                  <View key={`inter-${idx}-${st.id}`} style={styles.intermediateNodeRow}>
                    <View style={styles.timeCol}>
                      <Text style={styles.intermediateTimeCol}>
                        {st.estimatedTime || ''}
                      </Text>
                    </View>
                    <View style={styles.railCol}>
                      <View
                        style={[
                          styles.intermediateBarSegment,
                          { backgroundColor: lineColor },
                        ]}
                      />
                      <View
                        style={[
                          styles.intermediateDotOnRail,
                          { borderColor: lineColor },
                        ]}
                      />
                      <View
                        style={[
                          styles.intermediateBarSegment,
                          { backgroundColor: lineColor },
                        ]}
                      />
                    </View>
                    <View style={styles.intermediateInfoCol}>
                      <Text style={styles.intermediateName}>{st.name}</Text>
                      {st.hasControllerAlert && (
                        <View style={styles.controllerStopBadge}>
                          <Text style={styles.controllerStopBadgeText}>
                            🚨 Contrôle
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}

              {/* Alighting Stop (Ringed Circle) */}
              <View style={styles.nodeRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeStrong}>
                    {seg.arrivalTime || stopTimes[stopTimes.length - 1] || ''}
                  </Text>
                </View>
                <View style={styles.railCol}>
                  <View
                    style={[
                      styles.alightingCircleRinged,
                      { borderColor: lineColor },
                    ]}
                  />
                  <View style={styles.dashedConnector} />
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.stopBoldTitle}>
                    {seg.toStop?.name || 'Arrêt de descente'}
                  </Text>
                  <Text style={styles.nodeSub}>Descendre ici</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Final Destination Node */}
        <View style={styles.nodeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.timeStrong}>{route.arrivalTime}</Text>
          </View>
          <View style={styles.railCol}>
            <View style={styles.destPin} />
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.nodeTitle}>{destinationLabel}</Text>
            <Text style={styles.nodeSub}>Arrivée estimée à destination</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#202124',
  },
  headerTexts: {
    flex: 1,
  },
  headerDuration: {
    fontSize: 19,
    fontWeight: '900',
    color: '#202124',
  },
  headerArrival: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5F6368',
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  alertBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  alertIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  alertTexts: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B42318',
  },
  alertSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#912018',
    marginTop: 2,
  },
  segmentBlock: {
    marginBottom: 2,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 46,
  },
  timeCol: {
    width: 48,
    paddingTop: 2,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  timeStrong: {
    fontSize: 12,
    fontWeight: '800',
    color: '#202124',
  },
  timeMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#70757A',
  },
  railCol: {
    width: 26,
    alignItems: 'center',
  },
  originDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1A73E8',
    borderWidth: 3,
    borderColor: '#D2E3FC',
    marginTop: 2,
  },
  destPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D93025',
    borderWidth: 3,
    borderColor: '#FAD2CF',
    marginTop: 2,
  },
  dashedConnector: {
    flex: 1,
    width: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BDC1C6',
    marginVertical: 3,
    minHeight: 18,
  },
  dashedConnectorTall: {
    flex: 1,
    width: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9AA0A6',
    marginVertical: 3,
    minHeight: 36,
  },
  walkIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkEmoji: {
    fontSize: 12,
  },
  transferBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferEmoji: {
    fontSize: 12,
  },
  boardingCircleFilled: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    marginTop: 2,
  },
  alightingCircleRinged: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 3.5,
    marginTop: 2,
  },
  thickTransitBar: {
    flex: 1,
    width: 5, // Signature 5px thick vertical line bar
    borderRadius: 3,
    marginVertical: 2,
    minHeight: 54,
  },
  infoCol: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 14,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#202124',
  },
  nodeSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#70757A',
    marginTop: 2,
  },
  walkTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3C4043',
  },
  walkMeta: {
    fontSize: 12,
    color: '#70757A',
    marginTop: 2,
  },
  turnsBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  turnArrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A73E8',
    marginRight: 6,
  },
  turnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#3C4043',
  },
  transferTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E65100',
  },
  stopBoldTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  transitBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 8,
  },
  linePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  linePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  directionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#3C4043',
  },
  timelineCrowdBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  timelineCrowdText: {
    fontSize: 11,
    fontWeight: '800',
  },
  accordionBtn: {
    marginTop: 8,
    paddingVertical: 5,
  },
  accordionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fallbackStopsInfo: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
  },
  intermediateNodeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 30,
  },
  intermediateTimeCol: {
    fontSize: 11,
    fontWeight: '700',
    color: '#70757A',
    paddingTop: 5,
  },
  intermediateBarSegment: {
    flex: 1,
    width: 5,
  },
  intermediateDotOnRail: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.5,
    backgroundColor: '#FFFFFF',
    marginVertical: -1,
    zIndex: 2,
  },
  intermediateInfoCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingVertical: 5,
    gap: 8,
  },
  intermediateName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#3C4043',
  },
  controllerStopBadge: {
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  controllerStopBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B42318',
  },
});
