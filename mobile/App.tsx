import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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

  const isNavigating = navState !== 'IDLE';

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
});
