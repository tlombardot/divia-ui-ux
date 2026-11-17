import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Header } from './src/components/common/Header';
import { TransitMap } from './src/components/map/TransitMap';
import { ActiveTripBottomSheet } from './src/components/navigation/ActiveTripBottomSheet';
import { RouteSearchBar } from './src/components/navigation/RouteSearchBar';
import { ReportCard } from './src/components/reports/ReportCard';
import { ReportModal } from './src/components/reports/ReportModal';
import { useLiveNavigation } from './src/hooks/useLiveNavigation';
import { useLocation } from './src/hooks/useLocation';
import { useReports } from './src/hooks/useReports';
import { apiService } from './src/services/apiService';
import { GeocodedAddress, Report, RouteOption, TransitStop } from './src/types';

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const { location, isDemoMode, refreshLocation } = useLocation();
  const { reports, createReport, voteReport } = useReports();
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

  const [originText, setOriginText] = useState<string>('Ma position (GPS)');
  const [destinationText, setDestinationText] = useState<string>('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number; label: string }>({
    lat: location.latitude,
    lng: location.longitude,
    label: 'Ma position (GPS)',
  });
  const [availableRoutes, setAvailableRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [activeReportCard, setActiveReportCard] = useState<Report | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState<boolean>(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);

  const isNavigating = navState !== 'IDLE';

  // Alerte contrôleur en cours de navigation active
  const liveControllerAlert = useMemo(() => {
    if (!isNavigating || !activeRoute) return null;
    const linesUsed = activeRoute.segments
      .filter(s => s.type === 'TRANSIT' && s.lineId)
      .map(s => s.lineId as string);

    const alert = reports.find(
      r => r.status === 'active' && linesUsed.includes(r.lineId) && r.id !== dismissedAlertId
    );
    return alert || null;
  }, [isNavigating, activeRoute, reports, dismissedAlertId]);

  // Déclenchement de la vibration haptique en cas d'alerte contrôleur
  useEffect(() => {
    if (liveControllerAlert) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        // Ignore
      }
    }
  }, [liveControllerAlert]);

  // Search routes to a target coordinate
  const fetchRouteAlternatives = useCallback(
    async (
      fromLat: number,
      fromLng: number,
      toLat: number,
      toLng: number,
      fromLabel: string,
      toLabel: string
    ) => {
      setIsLoadingRoutes(true);
      try {
        const routes = await apiService.fetchRoutes(
          fromLat,
          fromLng,
          toLat,
          toLng,
          fromLabel,
          toLabel
        );

        if (routes.length > 0) {
          setAvailableRoutes(routes);
          setSelectedRoute(routes[0]);
        }
      } catch (err) {
        console.warn('[App] Erreur lors de la recherche d\'itinéraires:', err);
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    []
  );

  // Quick chip stop selection
  const handleSelectQuickStop = useCallback(
    (stop: TransitStop) => {
      setDestinationText(stop.name);
      fetchRouteAlternatives(
        originCoords.lat || location.latitude,
        originCoords.lng || location.longitude,
        stop.latitude,
        stop.longitude,
        originCoords.label,
        stop.name
      );
    },
    [originCoords, location.latitude, location.longitude, fetchRouteAlternatives]
  );

  // Address selection from BAN or Divia autocompletion
  const handleSelectAddress = useCallback(
    (address: GeocodedAddress, targetField: 'origin' | 'destination') => {
      if (targetField === 'origin') {
        setOriginText(address.label);
        setOriginCoords({
          lat: address.latitude,
          lng: address.longitude,
          label: address.label,
        });
      } else {
        setDestinationText(address.label);
        fetchRouteAlternatives(
          originCoords.lat || location.latitude,
          originCoords.lng || location.longitude,
          address.latitude,
          address.longitude,
          originCoords.label,
          address.label
        );
      }
    },
    [originCoords, location.latitude, location.longitude, fetchRouteAlternatives]
  );

  const handleStartNavigation = () => {
    if (selectedRoute) {
      startNavigation(selectedRoute);
      setAvailableRoutes([]);
    }
  };

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* Fullscreen Map with Multi-Segments Route */}
        <TransitMap
          mapRef={mapRef}
          userLocation={isNavigating ? currentLocation : location}
          reports={reports}
          activeRoute={isNavigating ? activeRoute : selectedRoute}
          onSelectReport={report => setActiveReportCard(report)}
          onOpenReportModal={() => setIsReportModalVisible(true)}
          onSelectStop={stop => handleSelectQuickStop(stop)}
          onRecenter={handleRecenter}
        />

        {/* Top Header */}
        <Header isDemoMode={isDemoMode} onRefreshLocation={refreshLocation} />

        {/* Live Controller Alert Banner during active navigation */}
        {liveControllerAlert && (
          <View style={styles.topLiveAlert}>
            <Text style={styles.topLiveAlertIcon}>🚨</Text>
            <View style={styles.topLiveAlertContent}>
              <Text style={styles.topLiveAlertTitle}>Contrôle signalé sur votre ligne !</Text>
              <Text style={styles.topLiveAlertText}>
                {liveControllerAlert.stopName} ({liveControllerAlert.lineId}) · {liveControllerAlert.direction}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setDismissedAlertId(liveControllerAlert.id)}
              style={styles.dismissBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Vu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search & Navigation Bar (when not in active trip) */}
        {!isNavigating && (
          <RouteSearchBar
            originText={originText}
            destinationText={destinationText}
            onOriginChange={setOriginText}
            onDestinationChange={setDestinationText}
            onSelectAddress={handleSelectAddress}
            onSelectQuickStop={handleSelectQuickStop}
            selectedRoute={selectedRoute}
            availableRoutes={availableRoutes}
            onSelectRoute={route => setSelectedRoute(route)}
            onStartNavigation={handleStartNavigation}
            isLoadingRoutes={isLoadingRoutes}
          />
        )}

        {/* Active Trip Bottom Sheet (when in navigation - 100% Geofenced, Zero Manual Buttons) */}
        {isNavigating && activeRoute && (
          <ActiveTripBottomSheet
            route={activeRoute}
            navState={navState}
            currentSegmentIndex={currentSegmentIndex}
            distanceToNextStep={distanceToNextStep}
            passedStopsCount={passedStopsCount}
            alightingWarning={alightingWarning}
            isSimulating={isSimulating}
            simulationProgress={simulationProgress}
            onStartSimulation={startSimulation}
            onStopSimulation={stopSimulation}
            onEndTrip={stopNavigation}
          />
        )}

        {/* Floating Report Inspector Card */}
        {activeReportCard && (
          <ReportCard
            report={activeReportCard}
            onVoteUp={reportId => {
              voteReport(reportId, 'up');
              setActiveReportCard(null);
            }}
            onVoteDown={reportId => {
              voteReport(reportId, 'down');
              setActiveReportCard(null);
            }}
            onClose={() => setActiveReportCard(null)}
          />
        )}

        {/* Waze-style 2-taps Report Modal */}
        <ReportModal
          visible={isReportModalVisible}
          userLocation={location}
          onClose={() => setIsReportModalVisible(false)}
          onSubmitReport={createReport}
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
  topLiveAlert: {
    position: 'absolute',
    top: 76,
    left: 16,
    right: 16,
    backgroundColor: '#B71C1C',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 45,
  },
  topLiveAlertIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  topLiveAlertContent: {
    flex: 1,
  },
  topLiveAlertTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  topLiveAlertText: {
    color: '#FFCDD2',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  dismissBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  dismissBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
