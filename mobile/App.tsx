import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Header } from './src/components/common/Header';
import { TransitMap } from './src/components/map/TransitMap';
import { ActiveTripBottomSheet } from './src/components/navigation/ActiveTripBottomSheet';
import { RouteSearchBar } from './src/components/navigation/RouteSearchBar';
import { ReportCard } from './src/components/reports/ReportCard';
import { ReportModal } from './src/components/reports/ReportModal';
import { useLocation } from './src/hooks/useLocation';
import { useNavigationState } from './src/hooks/useNavigationState';
import { useReports } from './src/hooks/useReports';
import { apiService } from './src/services/apiService';
import { GeocodedAddress, Report, RouteOption, TransitStop } from './src/types';

export default function App() {
  const { location, isDemoMode, refreshLocation } = useLocation();
  const { reports, createReport, voteReport } = useReports();
  const {
    activeRoute,
    currentStepIndex,
    isNavigating,
    startTrip,
    nextStep,
    endTrip,
  } = useNavigationState();

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
        } else {
          // Fallback client route
          const fallbackRoute: RouteOption = {
            id: `route-client-fallback-${Date.now()}`,
            title: 'Itinéraire direct',
            departureTime: '19:00',
            arrivalTime: '19:15',
            totalDurationMinutes: 15,
            walkingDurationMinutes: 4,
            transitDurationMinutes: 11,
            transfersCount: 0,
            summary: `T1 direct jusqu'à ${toLabel}`,
            nextDepartureMinutes: 2,
            hasControllerAlert: false,
            alerts: [],
            fullPolyline: [[fromLat, fromLng], [toLat, toLng]],
            segments: [
              {
                type: 'WALK',
                instruction: 'Marcher jusqu\'à l\'arrêt de tramway',
                durationMinutes: 2,
                distanceMeters: 150,
                polyline: [[fromLat, fromLng], [fromLat + 0.001, fromLng + 0.001]],
              },
              {
                type: 'TRANSIT',
                instruction: 'Prendre le Tram T1',
                durationMinutes: 11,
                distanceMeters: 2200,
                polyline: [[fromLat + 0.001, fromLng + 0.001], [toLat - 0.001, toLng - 0.001]],
                lineId: 'T1',
                lineColor: '#E11535',
              },
              {
                type: 'WALK',
                instruction: `Marcher jusqu'à ${toLabel}`,
                durationMinutes: 2,
                distanceMeters: 100,
                polyline: [[toLat - 0.001, toLng - 0.001], [toLat, toLng]],
              },
            ],
            steps: [
              {
                type: 'walk',
                instruction: 'Marcher jusqu\'à l\'arrêt le plus proche',
                durationMinutes: 2,
                distanceMeters: 150,
              },
              {
                type: 'transit',
                instruction: 'Prendre le Tram T1',
                durationMinutes: 11,
                distanceMeters: 2200,
                lineId: 'T1',
                lineColor: '#E11535',
              },
              {
                type: 'walk',
                instruction: `Arrivée à ${toLabel}`,
                durationMinutes: 2,
                distanceMeters: 100,
              },
            ],
          };
          setAvailableRoutes([fallbackRoute]);
          setSelectedRoute(fallbackRoute);
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
      startTrip(selectedRoute);
      setAvailableRoutes([]);
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* Fullscreen Map with Multi-Segments Route */}
        <TransitMap
          userLocation={location}
          reports={reports}
          activeRoute={selectedRoute}
          onSelectReport={report => setActiveReportCard(report)}
          onOpenReportModal={() => setIsReportModalVisible(true)}
          onSelectStop={stop => handleSelectQuickStop(stop)}
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

        {/* Active Trip Bottom Sheet (when in navigation) */}
        {isNavigating && activeRoute && (
          <ActiveTripBottomSheet
            route={activeRoute}
            currentStepIndex={currentStepIndex}
            onNextStep={nextStep}
            onEndTrip={endTrip}
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
