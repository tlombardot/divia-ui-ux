import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LineFilterSheet } from './src/components/map/LineFilterSheet';
import { TransitMap } from './src/components/map/TransitMap';
import { ActiveTripBottomSheet } from './src/components/navigation/ActiveTripBottomSheet';
import { ReportBottomSheet } from './src/components/reports/ReportBottomSheet';
import { ReportCard } from './src/components/reports/ReportCard';
import { DirectionsHeader } from './src/components/search/DirectionsHeader';
import { FloatingSearchHeader } from './src/components/search/FloatingSearchHeader';
import { NearbyStopsContent } from './src/components/sheet/NearbyStopsContent';
import { RouteAlternativesContent } from './src/components/sheet/RouteAlternativesContent';
import { RouteTimelineContent } from './src/components/sheet/RouteTimelineContent';
import { StationDetailContent } from './src/components/sheet/StationDetailContent';
import {
  getSnapHeight,
  SheetSnapState,
  ThreeStateBottomSheet,
} from './src/components/sheet/ThreeStateBottomSheet';
import { useFavoriteStations } from './src/hooks/useFavoriteStations';
import { useLineFilter } from './src/hooks/useLineFilter';
import { useLiveNavigation } from './src/hooks/useLiveNavigation';
import { useLocation } from './src/hooks/useLocation';
import { useNetworkShapes } from './src/hooks/useNetworkShapes';
import { useReports } from './src/hooks/useReports';
import { apiService } from './src/services/apiService';
import { COLORS } from './src/theme/colors';
import { GeocodedAddress, Report, RouteOption, TransitLine, TransitStop } from './src/types';

type UiScreenMode = 'explore' | 'station' | 'directions' | 'timeline';

interface CoordPoint {
  lat: number;
  lng: number;
  label: string;
  isGps?: boolean;
}

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const { location, isDemoMode, refreshLocation } = useLocation();
  const { reports, controllerReports, createReport, voteReport } = useReports();
  const { favoriteIds, favoriteStops, isFavorite, toggleFavorite } = useFavoriteStations(location);
  const { lines: networkLines } = useNetworkShapes();
  const {
    visibleLineIds,
    totalLinesCount,
    toggleLine,
    ensureLineVisible,
    applyPreset,
  } = useLineFilter(networkLines);
  const {
    activeRoute,
    navState,
    currentSegmentIndex,
    currentLocation,
    distanceToNextStep,
    passedStopsCount,
    alightingWarning,
    isSimulating,
    simulationProgress,
    startNavigation,
    stopNavigation,
    startSimulation,
    stopSimulation,
  } = useLiveNavigation();

  const [uiMode, setUiMode] = useState<UiScreenMode>('explore');
  const [sheetSnap, setSheetSnap] = useState<SheetSnapState>('peek');
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [showControllersOnly, setShowControllersOnly] = useState<boolean>(false);
  const [isFollowingUser, setIsFollowingUser] = useState<boolean>(true);
  const [autoFocusDest, setAutoFocusDest] = useState<boolean>(false);

  const [originPoint, setOriginPoint] = useState<CoordPoint>({
    lat: location.latitude,
    lng: location.longitude,
    label: 'Ma position',
    isGps: true,
  });
  const [destinationPoint, setDestinationPoint] = useState<CoordPoint | null>(null);
  const [originText, setOriginText] = useState<string>('Ma position');
  const [destinationText, setDestinationText] = useState<string>('');

  const [availableRoutes, setAvailableRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);

  const [activeReportCard, setActiveReportCard] = useState<Report | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState<boolean>(false);
  const [isLineFilterVisible, setIsLineFilterVisible] = useState<boolean>(false);
  const [reportTargetStop, setReportTargetStop] = useState<TransitStop | null>(null);
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);

  const isNavigating = navState !== 'IDLE';
  const effectiveUserLocation = isNavigating ? currentLocation : location;

  // Keep "Ma position" strictly anchored to the user's real GPS coordinates
  useEffect(() => {
    if (originPoint.isGps) {
      setOriginPoint(prev => ({
        ...prev,
        lat: location.latitude,
        lng: location.longitude,
      }));
    }
  }, [location.latitude, location.longitude, originPoint.isGps]);

  // Fit map camera cleanly to selected route polyline
  const fitMapToRoute = useCallback((route: RouteOption) => {
    if (!mapRef.current || !route.fullPolyline || route.fullPolyline.length < 2) return;
    const coords = route.fullPolyline.map(([latitude, longitude]) => ({
      latitude,
      longitude,
    }));
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 180, right: 50, bottom: 380, left: 50 },
      animated: true,
    });
    setIsFollowingUser(false);
  }, []);

  // Fetch door-to-door routes from server
  const fetchRouteAlternatives = useCallback(
    async (origin: CoordPoint, dest: CoordPoint) => {
      setIsLoadingRoutes(true);
      setUiMode('directions');
      setSheetSnap('half');
      try {
        const routes = await apiService.fetchRoutes(
          origin.lat,
          origin.lng,
          dest.lat,
          dest.lng,
          origin.label,
          dest.label
        );
        setAvailableRoutes(routes);
        if (routes.length > 0) {
          setSelectedRoute(routes[0]);
          fitMapToRoute(routes[0]);
        } else {
          setSelectedRoute(null);
        }
      } catch (err) {
        console.warn('[App] Erreur calcul itinéraires:', err);
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    [fitMapToRoute]
  );

  // Open station sheet when tapping a map marker or nearby stop
  const handleSelectStation = useCallback((stop: TransitStop) => {
    setSelectedStop(stop);
    setUiMode('station');
    setSheetSnap('half');
    setActiveReportCard(null);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: stop.latitude - 0.004,
        longitude: stop.longitude,
        latitudeDelta: 0.014,
        longitudeDelta: 0.014,
      });
      setIsFollowingUser(false);
    }
  }, []);

  // Route directly to a stop (from quick chip or station sheet CTA)
  const handleRouteToStop = useCallback(
    (stop: TransitStop) => {
      const origin: CoordPoint = originPoint.isGps
        ? { lat: location.latitude, lng: location.longitude, label: 'Ma position', isGps: true }
        : originPoint;
      const dest: CoordPoint = {
        lat: stop.latitude,
        lng: stop.longitude,
        label: stop.name,
      };
      setOriginPoint(origin);
      setOriginText(origin.label);
      setDestinationPoint(dest);
      setDestinationText(stop.name);
      setAutoFocusDest(false);
      fetchRouteAlternatives(origin, dest);
    },
    [originPoint, location.latitude, location.longitude, fetchRouteAlternatives]
  );

  // Address selection from BAN / Divia Autocomplete
  const handleSelectAddress = useCallback(
    (address: GeocodedAddress, field: 'origin' | 'destination') => {
      const point: CoordPoint = {
        lat: address.latitude,
        lng: address.longitude,
        label: address.label,
        isGps: false,
      };

      if (field === 'origin') {
        setOriginPoint(point);
        setOriginText(address.label);
        if (destinationPoint) {
          fetchRouteAlternatives(point, destinationPoint);
        }
      } else {
        setDestinationPoint(point);
        setDestinationText(address.label);
        fetchRouteAlternatives(originPoint, point);
      }
    },
    [originPoint, destinationPoint, fetchRouteAlternatives]
  );

  // Use real GPS position for origin or destination
  const handleUseCurrentLocation = useCallback(
    (field: 'origin' | 'destination') => {
      const gpsPoint: CoordPoint = {
        lat: location.latitude,
        lng: location.longitude,
        label: 'Ma position',
        isGps: true,
      };
      if (field === 'origin') {
        setOriginPoint(gpsPoint);
        setOriginText('Ma position');
        if (destinationPoint) {
          fetchRouteAlternatives(gpsPoint, destinationPoint);
        }
      } else {
        setDestinationPoint(gpsPoint);
        setDestinationText('Ma position');
        fetchRouteAlternatives(originPoint, gpsPoint);
      }
    },
    [location.latitude, location.longitude, originPoint, destinationPoint, fetchRouteAlternatives]
  );

  // Swap Origin <-> Destination
  const handleSwapOriginDestination = useCallback(() => {
    if (!destinationPoint) return;
    const newOrigin = destinationPoint;
    const newDest = originPoint;
    setOriginPoint(newOrigin);
    setOriginText(newOrigin.label);
    setDestinationPoint(newDest);
    setDestinationText(newDest.label);
    fetchRouteAlternatives(newOrigin, newDest);
  }, [originPoint, destinationPoint, fetchRouteAlternatives]);

  const handleCloseDirections = useCallback(() => {
    setUiMode('explore');
    setSheetSnap('peek');
    setAvailableRoutes([]);
    setSelectedRoute(null);
    setDestinationPoint(null);
    setDestinationText('');
  }, []);

  const handleOpenSearch = useCallback(() => {
    setAutoFocusDest(true);
    setUiMode('directions');
    setSheetSnap('half');
  }, []);

  const handleSelectRouteCard = useCallback(
    (route: RouteOption) => {
      setSelectedRoute(route);
      fitMapToRoute(route);
      setUiMode('timeline');
      setSheetSnap('half');
    },
    [fitMapToRoute]
  );

  const handleStartNavigation = useCallback(() => {
    if (!selectedRoute) return;
    startNavigation(selectedRoute);
    setIsFollowingUser(true);
  }, [selectedRoute, startNavigation]);

  const handleRecenter = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: effectiveUserLocation.latitude,
        longitude: effectiveUserLocation.longitude,
        latitudeDelta: 0.014,
        longitudeDelta: 0.014,
      });
      setIsFollowingUser(true);
    }
  }, [effectiveUserLocation.latitude, effectiveUserLocation.longitude]);

  // "Centrer sur la ligne" from LineFilterSheet
  const handleFocusLine = useCallback(
    (line: TransitLine) => {
      ensureLineVisible(line.id);
      setIsLineFilterVisible(false);
      if (mapRef.current && line.polyline.length >= 2) {
        const coords = line.polyline.map(([latitude, longitude]) => ({
          latitude,
          longitude,
        }));
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 150, right: 45, bottom: 260, left: 45 },
          animated: true,
        });
        setIsFollowingUser(false);
      }
    },
    [ensureLineVisible]
  );

  // Live Waze Controller Alert during active navigation
  const liveControllerAlert = useMemo(() => {
    if (!isNavigating || !activeRoute) return null;
    const linesUsed = activeRoute.segments
      .filter(s => s.type === 'TRANSIT' && s.lineId)
      .map(s => s.lineId as string);

    const alert = controllerReports.find(
      r => linesUsed.includes(r.lineId) && r.id !== dismissedAlertId
    );
    return alert || null;
  }, [isNavigating, activeRoute, controllerReports, dismissedAlertId]);

  useEffect(() => {
    if (liveControllerAlert) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        // Ignore
      }
    }
  }, [liveControllerAlert]);

  // Compute floating action buttons bottom offset cleanly above the bottom sheet or nav card
  const floatingBottomOffset = isNavigating
    ? 148
    : getSnapHeight(sheetSnap) + 14;

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style={isNavigating ? 'light' : 'dark'} />

        {/* Fullscreen Interactive Map */}
        <TransitMap
          mapRef={mapRef}
          userLocation={effectiveUserLocation}
          reports={reports}
          networkLines={networkLines}
          visibleLineIds={visibleLineIds}
          favoriteStopIds={favoriteIds}
          activeRoute={isNavigating ? activeRoute : selectedRoute}
          selectedStopId={selectedStop?.id}
          showControllersOnly={showControllersOnly}
          isFollowingUser={isFollowingUser}
          floatingBottomOffset={floatingBottomOffset}
          hideFloatingButtons={!isNavigating && sheetSnap === 'full'}
          onSelectReport={report => setActiveReportCard(report)}
          onOpenReportModal={() => {
            setReportTargetStop(null);
            setIsReportModalVisible(true);
          }}
          onSelectStop={handleSelectStation}
          onRecenter={handleRecenter}
          onMapPanDrag={() => setIsFollowingUser(false)}
        />

        {/* Top Explore Search Bar OR Connected Directions Header */}
        {!isNavigating && (uiMode === 'explore' || uiMode === 'station') && (
          <FloatingSearchHeader
            onOpenSearch={handleOpenSearch}
            onOpenLineFilter={() => setIsLineFilterVisible(true)}
            visibleLinesCount={visibleLineIds.length}
            totalLinesCount={totalLinesCount}
            onSelectQuickStop={handleRouteToStop}
            showControllersOnly={showControllersOnly}
            onToggleControllersFilter={() => setShowControllersOnly(prev => !prev)}
            activeReportsCount={controllerReports.length}
            isDemoMode={isDemoMode}
          />
        )}

        {!isNavigating && (uiMode === 'directions' || uiMode === 'timeline') && (
          <DirectionsHeader
            originText={originText}
            destinationText={destinationText}
            onOriginChange={setOriginText}
            onDestinationChange={setDestinationText}
            onSelectAddress={handleSelectAddress}
            onUseCurrentLocation={handleUseCurrentLocation}
            onSwapOriginDestination={handleSwapOriginDestination}
            onCloseDirections={handleCloseDirections}
            autoFocusDestination={autoFocusDest}
          />
        )}

        {/* Non-Modal 3-State Bottom Sheet (Explore / Station / Directions / Timeline) */}
        {!isNavigating && (
          <ThreeStateBottomSheet
            snapState={sheetSnap}
            onSnapChange={setSheetSnap}
            footer={
              uiMode === 'timeline' && selectedRoute ? (
                <TouchableOpacity
                  style={styles.stickyStartButton}
                  onPress={handleStartNavigation}
                  activeOpacity={0.85}
                >
                  <Text style={styles.stickyStartIcon}>➤</Text>
                  <Text style={styles.stickyStartText}>
                    Démarrer · {selectedRoute.totalDurationMinutes} min
                  </Text>
                </TouchableOpacity>
              ) : undefined
            }
          >
            {uiMode === 'explore' && (
              <NearbyStopsContent
                userLocation={location}
                reports={reports}
                favoriteStops={favoriteStops}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onSelectStop={handleSelectStation}
                onNavigateToStop={handleRouteToStop}
                onRefreshLocation={refreshLocation}
              />
            )}

            {uiMode === 'station' && selectedStop && (
              <StationDetailContent
                stop={selectedStop}
                userLocation={location}
                reports={reports}
                isFavorite={isFavorite(selectedStop.id)}
                onToggleFavorite={toggleFavorite}
                onClose={() => {
                  setSelectedStop(null);
                  setUiMode('explore');
                  setSheetSnap('peek');
                }}
                onNavigateToStop={handleRouteToStop}
                onReportAtStation={stop => {
                  setReportTargetStop(stop);
                  setIsReportModalVisible(true);
                }}
                onVoteReport={voteReport}
              />
            )}

            {uiMode === 'directions' && (
              <RouteAlternativesContent
                routes={availableRoutes}
                selectedRouteId={selectedRoute?.id}
                isLoading={isLoadingRoutes}
                onSelectRoute={handleSelectRouteCard}
              />
            )}

            {uiMode === 'timeline' && selectedRoute && (
              <RouteTimelineContent
                route={selectedRoute}
                originLabel={originPoint.label}
                destinationLabel={destinationPoint?.label || destinationText || 'Destination'}
                onBackToList={() => {
                  setUiMode('directions');
                  setSheetSnap('half');
                }}
              />
            )}
          </ThreeStateBottomSheet>
        )}

        {/* Active Turn-by-Turn GPS Navigation */}
        {isNavigating && activeRoute && (
          <ActiveTripBottomSheet
            route={activeRoute}
            navState={navState}
            currentSegmentIndex={currentSegmentIndex}
            distanceToNextStep={distanceToNextStep}
            passedStopsCount={passedStopsCount}
            alightingWarning={alightingWarning}
            liveControllerAlert={liveControllerAlert}
            onDismissControllerAlert={id => setDismissedAlertId(id)}
            isSimulating={isSimulating}
            simulationProgress={simulationProgress}
            onStartSimulation={startSimulation}
            onStopSimulation={stopSimulation}
            onEndTrip={() => {
              stopNavigation();
              setUiMode('explore');
              setSheetSnap('peek');
            }}
          />
        )}

        {/* Floating Waze Report Card on Marker Tap */}
        {activeReportCard && (
          <ReportCard
            report={activeReportCard}
            onVoteUp={(reportId, recalibrateStopId) => {
              voteReport(reportId, 'up', recalibrateStopId);
              setActiveReportCard(null);
            }}
            onVoteDown={reportId => {
              voteReport(reportId, 'down');
              setActiveReportCard(null);
            }}
            onClose={() => setActiveReportCard(null)}
          />
        )}

        {/* Redesigned Divia Waze & Crowd Reporting Bottom Sheet */}
        <ReportBottomSheet
          visible={isReportModalVisible}
          userLocation={effectiveUserLocation}
          initialStop={reportTargetStop}
          onClose={() => {
            setIsReportModalVisible(false);
            setReportTargetStop(null);
          }}
          onSubmitReport={createReport}
        />

        {/* Interactive Divia Line Filter Sheet */}
        <LineFilterSheet
          visible={isLineFilterVisible}
          lines={networkLines}
          visibleLineIds={visibleLineIds}
          controllerReports={controllerReports}
          onClose={() => setIsLineFilterVisible(false)}
          onToggleLine={toggleLine}
          onApplyPreset={applyPreset}
          onFocusLine={handleFocusLine}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  stickyStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cassis,
    borderRadius: 28,
    paddingVertical: 15,
    gap: 10,
    shadowColor: COLORS.cassis,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  stickyStartIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  stickyStartText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
