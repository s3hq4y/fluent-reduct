/**
 * Fluent Reduct - floating cleanup ball window (main process).
 *
 * Owns a small, frameless, always-on-top window that lives outside the taskbar.
 * It never performs a cleanup itself: `ball:request-cleanup` is forwarded to the
 * main window, so confirmation, logging and the progress dialog stay in one
 * place.
 *
 * The window has three shapes, and the main process owns all three because it
 * is the only side that knows the work area:
 *
 *   floating   a full ball, anywhere on the desktop
 *   docked     a full ball flush against a screen edge (while pointed at)
 *   collapsed  a thin bar along that edge, showing usage as a fill level
 *
 * The renderer is told which shape to draw through `ball-dock`; it never
 * computes geometry itself.
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import type { BallDockState, BallEdge, BallPosition, FloatingBallConfig } from '../../shared/types';

const BALL_ENTRY = path.join(__dirname, '..', 'ball', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.ico');

/** Visible diameter of the ball. */
const BALL_SIZE = 64;

/** Transparent padding around the ball so its drop shadow is not clipped. */
const SHADOW_MARGIN = 4;

/** Size of the floating window (ball plus shadow padding). */
const FLOATING_SIZE = BALL_SIZE + SHADOW_MARGIN * 2;

/** Collapsed bar geometry: it runs parallel to the edge it is attached to. */
const BAR_THICKNESS = 14;
const BAR_LENGTH = 56;

/** How close (in px) the ball must be dropped to an edge to dock there. */
const DOCK_SNAP_PX = 28;

/** Gap from the screen edge used by the default position. */
const EDGE_MARGIN = 24;

/**
 * Always-on-top level for the ball.
 *
 * Electron maps this to the Win32 topmost level; `screen-saver` is the highest
 * one available, so the ball stays above other always-on-top windows instead of
 * only above normal ones.
 */
const ALWAYS_ON_TOP_LEVEL = 'screen-saver';

let ballWindow: BrowserWindow | null = null;

/** Centre of the ball, in screen coordinates. Preserved across shape changes. */
let anchor: BallPosition = { x: 0, y: 0 };

let dock: BallDockState = { edge: null, collapsed: false };

interface Size {
  width: number;
  height: number;
}

/** Window size for a given shape. */
function sizeFor(edge: BallEdge | null, collapsed: boolean): Size {
  if (!edge) return { width: FLOATING_SIZE, height: FLOATING_SIZE };
  if (!collapsed) return { width: BALL_SIZE, height: BALL_SIZE };
  return isVerticalEdge(edge)
    ? { width: BAR_THICKNESS, height: BAR_LENGTH }
    : { width: BAR_LENGTH, height: BAR_THICKNESS };
}

/** True when the edge runs vertically, i.e. left or right. */
function isVerticalEdge(edge: BallEdge): boolean {
  return edge === 'left' || edge === 'right';
}

/** The work area of the display the ball currently sits on. */
function workArea() {
  return screen.getDisplayNearestPoint({
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
  }).workArea;
}

/**
 * Top-left position for the current shape.
 *
 * Docked shapes are flush with the edge; only the axis along the edge follows
 * the anchor, so collapsing never makes the ball jump sideways.
 */
function positionFor(edge: BallEdge | null, collapsed: boolean): BallPosition {
  const area = workArea();
  const size = sizeFor(edge, collapsed);
  const right = area.x + area.width;
  const bottom = area.y + area.height;

  switch (edge) {
    case 'left':
      return { x: area.x, y: clampAxis(anchor.y - size.height / 2, area.y, bottom - size.height) };
    case 'right':
      return {
        x: right - size.width,
        y: clampAxis(anchor.y - size.height / 2, area.y, bottom - size.height),
      };
    case 'top':
      return { x: clampAxis(anchor.x - size.width / 2, area.x, right - size.width), y: area.y };
    case 'bottom':
      return {
        x: clampAxis(anchor.x - size.width / 2, area.x, right - size.width),
        y: bottom - size.height,
      };
    default:
      // Free-floating: still clamped, so a stale saved position cannot put the
      // ball somewhere the user cannot reach it.
      return {
        x: clampAxis(anchor.x - size.width / 2, area.x, right - size.width),
        y: clampAxis(anchor.y - size.height / 2, area.y, bottom - size.height),
      };
  }
}

function clampAxis(value: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
}

/** Push the current shape to the window and tell the renderer which form to draw. */
function applyGeometry(): void {
  if (!ballWindow || ballWindow.isDestroyed()) return;

  const size = sizeFor(dock.edge, dock.collapsed);
  const position = positionFor(dock.edge, dock.collapsed);

  ballWindow.setBounds({ ...position, ...size });
  ballWindow.webContents.send('ball-dock', dock);
}

/**
 * Decide which edge, if any, the ball should attach to based on where it was
 * dropped. Returns null when it was left in the middle of the desktop.
 */
function detectEdge(): BallEdge | null {
  const area = workArea();
  const half = BALL_SIZE / 2;

  const distances: Array<[BallEdge, number]> = [
    ['left', anchor.x - area.x - half],
    ['right', area.x + area.width - (anchor.x + half)],
    ['top', anchor.y - area.y - half],
    ['bottom', area.y + area.height - (anchor.y + half)],
  ];

  const [edge, distance] = distances.reduce((closest, candidate) =>
    candidate[1] < closest[1] ? candidate : closest
  );

  return distance <= DOCK_SNAP_PX ? edge : null;
}

export function isBallVisible(): boolean {
  return !!ballWindow && !ballWindow.isDestroyed() && ballWindow.isVisible();
}

/** Send an event to the ball window, if it exists. */
export function sendToBall(channel: string, payload?: unknown): void {
  if (!ballWindow || ballWindow.isDestroyed()) return;
  ballWindow.webContents.send(channel, payload);
}

/** Create the ball window if the config enables it; destroy it otherwise. */
export function applyBallConfig(config: FloatingBallConfig): void {
  if (!config.enabled) {
    destroyBall();
    return;
  }

  // Docking is only restored, never inferred on first run: the default corner
  // position sits within the snap distance, so detecting unconditionally would
  // collapse the ball the instant it was enabled, which reads as a bug.
  const hasSavedPosition = config.position !== null;

  if (config.position) {
    anchor = { x: config.position.x + FLOATING_SIZE / 2, y: config.position.y + FLOATING_SIZE / 2 };
  } else {
    const area = screen.getPrimaryDisplay().workArea;
    anchor = {
      x: area.x + area.width - EDGE_MARGIN - BALL_SIZE / 2,
      y: area.y + area.height - EDGE_MARGIN - BALL_SIZE / 2,
    };
  }

  // Re-dock on restore: the saved position is the floating representation, so
  // running detection again reproduces the previous docked state. A restored
  // ball starts collapsed, which is its resting state.
  const edge = hasSavedPosition ? detectEdge() : null;
  dock = { edge, collapsed: edge !== null };

  if (ballWindow && !ballWindow.isDestroyed()) {
    applyGeometry();
    return;
  }

  createBall();
}

function createBall(): void {
  const size = sizeFor(dock.edge, dock.collapsed);
  const position = positionFor(dock.edge, dock.collapsed);

  ballWindow = new BrowserWindow({
    ...position,
    ...size,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    // Not focusable: clicking the ball must not steal focus from the active
    // window. Mouse input still reaches it, which is all it needs.
    focusable: false,
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Float above normal windows and other always-on-top windows, but keep clear
  // of fullscreen apps so the ball never covers a game or a video.
  ballWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  // Re-assert topmost whenever the window is shown: some fullscreen apps reset
  // the topmost flag of unrelated windows when they take over the screen.
  ballWindow.on('show', () => {
    ballWindow?.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  });

  void ballWindow.loadFile(BALL_ENTRY);

  ballWindow.once('ready-to-show', () => {
    if (!ballWindow) return;
    applyGeometry();
    ballWindow.showInactive();
  });

  // Keep the ball reachable when the display layout changes under it.
  const onDisplayChange = (): void => reflowBall();
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-removed', onDisplayChange);

  ballWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', onDisplayChange);
    screen.removeListener('display-removed', onDisplayChange);
    ballWindow = null;
  });

  if (process.argv.includes('--dev')) {
    ballWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

export function destroyBall(): void {
  if (!ballWindow || ballWindow.isDestroyed()) {
    ballWindow = null;
    return;
  }
  const window = ballWindow;
  ballWindow = null;
  window.destroy();
}

/**
 * Move the ball during a drag.
 *
 * `x`/`y` are the desired window centre in screen coordinates, not a window
 * origin. The renderer derives that from the pointer, so a drag keeps the ball
 * under the cursor regardless of which shape it was in when the drag began.
 *
 * Dragging always detaches the ball, so it stays free-floating until it is
 * dropped near an edge.
 */
export function moveBall(x: number, y: number): void {
  if (!ballWindow || ballWindow.isDestroyed()) return;

  anchor = { x, y };

  const wasDocked = dock.edge !== null || dock.collapsed;
  dock = { edge: null, collapsed: false };

  if (wasDocked) {
    applyGeometry();
  } else {
    const position = positionFor(null, false);
    ballWindow.setPosition(position.x, position.y);
  }
}

/**
 * Finish a drag: snap to an edge when dropped close enough, otherwise stay put.
 * A freshly docked ball starts collapsed, so it immediately gets out of the way.
 */
export function commitBallPosition(): BallPosition {
  const edge = detectEdge();
  dock = { edge, collapsed: edge !== null };
  applyGeometry();
  return getBallPosition();
}

/** Expand a docked ball while the pointer is over it, collapse it again after. */
export function setBallHover(inside: boolean): void {
  if (!dock.edge) return;

  const collapsed = !inside;
  if (dock.collapsed === collapsed) return;

  dock = { ...dock, collapsed };
  applyGeometry();
}

/**
 * The ball's position in its floating representation, which is what gets
 * persisted: the docked shape is re-derived from it on the next start.
 */
export function getBallPosition(): BallPosition {
  return {
    x: Math.round(anchor.x - FLOATING_SIZE / 2),
    y: Math.round(anchor.y - FLOATING_SIZE / 2),
  };
}

/**
 * Re-clamp the ball after a display change (resolution, monitor unplug) so it
 * cannot end up off-screen, and re-evaluate docking against the new layout.
 */
export function reflowBall(): void {
  if (!ballWindow || ballWindow.isDestroyed()) return;
  const area = workArea();
  anchor = {
    x: clampAxis(anchor.x, area.x + BALL_SIZE / 2, area.x + area.width - BALL_SIZE / 2),
    y: clampAxis(anchor.y, area.y + BALL_SIZE / 2, area.y + area.height - BALL_SIZE / 2),
  };
  dock = { edge: dock.edge ?? detectEdge(), collapsed: dock.collapsed };
  applyGeometry();
}
