/**
 * Ambiente de estúdio para dar brilho realista a materiais PBR (metais).
 *
 * Problema: modelos do Sketchfab são metálicos (metalness alto). Metal NÃO tem
 * cor própria — ele reflete o ambiente. Sem `scene.environment`, o metal vira
 * cinza/preto chapado, diferente da prévia do Sketchfab (que usa HDRI).
 *
 * Solução: gerar um pequeno HDRI procedural (gradiente de céu→chão + uma janela
 * clara) e passá-lo por PMREMGenerator. Funciona com qualquer instância de THREE
 * (a do pacote `three` ou a embutida no `skinview3d`), sem depender de arquivos
 * externos. NÃO altera textura nem tamanho dos arquivos.
 */

function makeStudioEquirect(THREE: any): any {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  // Gradiente vertical neutro (cinza-azulado): topo claro, horizonte e base escura.
  // Evita estourar o branco em metais claros (o environment ILUMINA, não "queima").
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.0, '#b9c4d4');
  g.addColorStop(0.45, '#dbe2ec');
  g.addColorStop(0.55, '#8b93a0');
  g.addColorStop(1.0, '#3c4149');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // "Janela" luminosa: cria o highlight especular típico de estúdio (sem dominar).
  const drawSoft = (x: number, y: number, rx: number, ry: number, a: number) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    rg.addColorStop(0, `rgba(255,255,255,${a})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
    ctx.translate(-x, -y);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawSoft(66, 40, 40, 26, 0.7);
  drawSoft(190, 52, 30, 20, 0.4);
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  try { tex.colorSpace = THREE.SRGBColorSpace; } catch { /* noop */ }
  tex.needsUpdate = true;
  return tex;
}

export interface ApplyEnvOptions {
  /** Intensidade do ambiente nos materiais (default 1.4). */
  intensity?: number;
  /** Aplicar ACES Filmic tone mapping no renderer (default true). */
  toneMapping?: boolean;
  /** Exposição do tone mapping (default 1.05). */
  exposure?: number;
}

/**
 * Cria e aplica `scene.environment` (PMREM) a partir do HDRI procedural.
 * Retorna o texture do environment (guarde em `scene.__envRT` p/ dispor depois)
 * ou null em caso de falha. É seguro chamar 1x por cena/renderer.
 */
export function applyEnvironment(THREE: any, renderer: any, scene: any, opts: ApplyEnvOptions = {}): any | null {
  try {
    if (!THREE || !renderer || !scene) return null;
    // Evita recriar se já existe (o mesmo renderer é cacheado globalmente).
    if (scene.environment) {
      tuneMaterialsForEnv(scene, opts.intensity ?? 1.4);
      return scene.environment;
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const eq = makeStudioEquirect(THREE);
    const rt = pmrem.fromEquirectangular(eq);
    try { eq.dispose?.(); } catch { /* noop */ }
    try { pmrem.dispose?.(); } catch { /* noop */ }
    if (rt?.texture) {
      scene.environment = rt.texture;
      (scene as any).__envRT = rt;
    }
    if (opts.toneMapping !== false) {
      try {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = opts.exposure ?? 0.85;
      } catch { /* noop */ }
    }
    return rt?.texture || null;
  } catch {
    return null;
  }
}

/** Dispose do environment guardado em `scene.__envRT`. */
export function disposeEnvironment(scene: any): void {
  try {
    const rt = scene?.__envRT;
    if (rt) { rt.dispose?.(); scene.__envRT = null; }
    if (scene) scene.environment = null;
  } catch { /* noop */ }
}

/**
 * Ajusta `envMapIntensity` nos materiais PBR já presentes: metais refletem mais
 * (bem mais "dourado"), não-metais recebem um realce leve.
 */
export function tuneMaterialsForEnv(root: any, intensity = 1.4): void {
  try {
    root?.traverse?.((o: any) => {
      if (!o?.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && 'envMapIntensity' in m) {
          const isMetal = (m.metalness ?? 0) > 0.4;
          m.envMapIntensity = isMetal ? intensity : Math.min(intensity, 1.1);
          m.needsUpdate = true;
        }
      }
    });
  } catch { /* noop */ }
}
