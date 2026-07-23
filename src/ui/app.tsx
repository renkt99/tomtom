import { currentRoute } from './router';
import { RouteList } from './screens/RouteList';
import { NewRoute } from './screens/NewRoute';
import { RouteDetail } from './screens/RouteDetail';
import { DriveScreen } from './screens/DriveScreen';
import { Settings } from './screens/Settings';

export function App() {
  const route = currentRoute.value;

  switch (route.screen) {
    case 'list':
      return <RouteList />;
    case 'new':
      return <NewRoute />;
    case 'detail':
      return <RouteDetail id={route.id} />;
    case 'drive':
      return <DriveScreen routeId={route.id} replayRunId={route.replayRunId} />;
    case 'drive-new':
      return <DriveScreen routeId={null} replayRunId={null} />;
    case 'settings':
      return <Settings />;
    default:
      return <RouteList />;
  }
}
