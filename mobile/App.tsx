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
import { ALL_DIJON_STOPS } from './src/data/dijonNetwork';
import { useLocation } from './src/hooks/useLocation';
import { useNavigationState } from './src/hooks/useNavigationState';
import { useReports } from './src/hooks/useReports';
import { apiService } from './src/services/apiService';
import { Report, RouteOption, TransitStop } from './src/types';

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

  const [destinationText, setDestinationText] = useState<string>('');
  const [availableRoutes, setAvailableRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [activeReportCard, setActiveReportCard] = useState<Report | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState<boolean>(false);

  // Search routes to a destination stop
  const handleSelectQuickStop = useCallback(
    async (stop: TransitStop) => {
      setDestinationText(stop.name);

      const routes = await apiService.fetchRoutes(
        location.latitude,
        location.longitude,
        stop.latitude,
        stop.longitude
      );

      if (routes.length > 0) {
        setAvailableRoutes(routes);
        setSelectedRoute(routes[0]);
      } else {
        // Fallback local route computation for standalone Expo Go preview
        const directRoute: RouteOption = {
          id: `route-client-fallback-${stop.id}`,
          departureTime: '18:35',
          arrivalTime: '18:48',
          totalDurationMinutes: 13,
          walkingDurationMinutes: 3,
          transitDurationMinutes: 10,
          transfersCount: 0,
          summary: `${stop.lines[0] || 'T1'} direct`,
          nextDepartureMinutes: 2,
          steps: [
            {
              type: 'walk',
              instruction: `Marcher jusqu'à l'arrêt le plus proche (120 m)`,
              durationMinutes: 2,
              distanceMeters: 120,
            },
            {
              type: 'transit',
              instruction: `Prendre le Tram ${stop.lines[0] || 'T1'}`,
              durationMinutes: 9,
              distanceMeters: 1800,
              lineId: stop.lines[0] || 'T1',
              lineColor: stop.lines[0] === 'T2' ? '#4B2982' : '#E11535',
              toStop: stop,
              stopsCount: 4,
            },
            {
              type: 'walk',
              instruction: `Arrivée à ${stop.name}`,
              durationMinutes: 2,
              distanceMeters: 80,
            },
          ],
        };
        setAvailableRoutes([directRoute]);
        setSelectedRoute(directRoute);
      }
    },
    [location.latitude, location.longitude]
  );

  const handleDestinationTextChange = (text: string) => {
    setDestinationText(text);
    if (text.length > 2) {
      const matched = ALL_DIJON_STOPS.find(s =>
        s.name.toLowerCase().includes(text.toLowerCase())
      );
      if (matched) {
        handleSelectQuickStop(matched);
      }
    } else {
      setAvailableRoutes([]);
      setSelectedRoute(null);
    }
  };

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

        {/* Fullscreen Map */}
        <TransitMap
          userLocation={location}
          reports={reports}
          onSelectReport={report => setActiveReportCard(report)}
          onOpenReportModal={() => setIsReportModalVisible(true)}
          onSelectStop={stop => handleSelectQuickStop(stop)}
        />

        {/* Top Header */}
        <Header isDemoMode={isDemoMode} onRefreshLocation={refreshLocation} />

        {/* Search & Navigation Bar (when not in active trip) */}
        {!isNavigating && (
          <RouteSearchBar
            destinationText={destinationText}
            onDestinationChange={handleDestinationTextChange}
            onSelectQuickStop={handleSelectQuickStop}
            selectedRoute={selectedRoute}
            availableRoutes={availableRoutes}
            onSelectRoute={route => setSelectedRoute(route)}
            onStartNavigation={handleStartNavigation}
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
