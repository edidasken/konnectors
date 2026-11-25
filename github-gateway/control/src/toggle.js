/**
 * Start / stop a managed MCP server via its launchd ctl script (or launchctl).
 * Turning a server off must cut access right away (bootout / stop).
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

/**
 * @param {object} server registry entry
 * @param {'on'|'off'} desired
 * @param {object} opts
 * @param {string} opts.who
 * @param {{log: Function}} opts.audit
 * @param {(server:object, action:'start'|'stop')=> {ok:boolean, detail:string}} [opts.runner]
 */
export function toggleServer(server, desired, opts) {
  if (desired !== 'on' && desired !== 'off') {
    throw new Error('desired must be on or off');
  }
  const action = desired === 'on' ? 'start' : 'stop';
  const runner = opts.runner || defaultRunner;
  const result = runner(server, action);
  opts.audit.log({
    event: 'control_toggle',
    who: opts.who || 'operator',
    server_id: server.id,
    unit: server.unit,
    desired,
    action,
    outcome: result.ok ? 'ok' : 'error',
    detail: result.detail,
  });
  return result;
}

/**
 * @param {object} server
 * @param {'start'|'stop'} action
 */
export function defaultRunner(server, action) {
  if (server.ctl_script && existsSync(server.ctl_script)) {
    const result = spawnSync(server.ctl_script, [action], {
      encoding: 'utf8',
      timeout: 15000,
    });
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim().slice(0, 400);
    if (result.status === 0) {
      return {ok: true, detail: detail || `${action}_ok`};
    }
    return {ok: false, detail: detail || `ctl_exit_${result.status}`};
  }

  const launchctl = process.env.MCP_CONTROL_LAUNCHCTL || 'launchctl';
  const uid = process.env.MCP_CONTROL_UID || String(process.getuid?.() ?? '');
  const domain = `gui/${uid}`;
  const label = server.unit;
  const plist =
    process.env.MCP_CONTROL_PLIST_DIR ||
    `${process.env.HOME || ''}/Library/LaunchAgents/${label}.plist`;

  if (action === 'stop') {
    const result = spawnSync(launchctl, ['bootout', `${domain}/${label}`], {
      encoding: 'utf8',
      timeout: 15000,
    });
    // bootout may fail if already stopped — treat as success for "cut access".
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim().slice(0, 400);
    return {ok: true, detail: detail || 'stopped'};
  }

  // start
  if (!existsSync(plist)) {
    return {ok: false, detail: `missing_plist:${plist}`};
  }
  let result = spawnSync(launchctl, ['bootstrap', domain, plist], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.status !== 0) {
    result = spawnSync(launchctl, ['kickstart', '-k', `${domain}/${label}`], {
      encoding: 'utf8',
      timeout: 15000,
    });
  }
  const detail = `${result.stdout || ''}${result.stderr || ''}`.trim().slice(0, 400);
  return {
    ok: result.status === 0,
    detail: detail || (result.status === 0 ? 'started' : `start_failed_${result.status}`),
  };
}
