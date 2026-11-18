import dotenv from 'dotenv';
import path from 'path';
import { networkGeometryService } from '../services/networkGeometryService';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

async function main() {
  const hasGoogleKey = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
  console.log(
    `[generate:network] Extraction des tracés Divia (Dijon) — Google Routes API : ${hasGoogleKey ? 'ACTIVE' : 'absente (fallback OSM/OSRM)'}...`
  );
  const start = Date.now();
  const payload = await networkGeometryService.generateNetworkShapes();
  const elapsed = Date.now() - start;

  console.log(`[generate:network] Terminé en ${elapsed} ms (version cache = ${payload.version}) :`);
  for (const line of payload.lines) {
    console.log(
      `  - ${line.id.padEnd(3)} (${line.category.padEnd(5)}) : ${line.polyline.length} pts aller / ${line.returnPolyline?.length || 0} pts retour [source: ${line.shapeSource}]`
    );
  }
}

main().catch(err => {
  console.error('[generate:network] Erreur:', err);
  process.exit(1);
});
