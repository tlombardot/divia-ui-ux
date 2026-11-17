import { networkGeometryService } from '../services/networkGeometryService';

async function main() {
  console.log('[generate:network] Extraction des vrais tracés OSM/OSRM pour le réseau Divia (Dijon)...');
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
