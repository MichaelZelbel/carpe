import { invoke } from "@tauri-apps/api/tauri";
import { getCurrent } from "@tauri-apps/api/window";
import { get } from "svelte/store";
import { signingAccount } from "./accounts";
import { raise_error } from "./carpeError";
import { responses } from "./debug";
import { backlog_in_progress, EpochRules, miner_loop_enabled, ProofProgress, tower } from "./miner";
import { network_profile } from "./networks";


const current_window = getCurrent();

// Only the backlog service needs a listener
export const startBacklogListener = async () => {
  await invoke("start_backlog_sender_listener", {})
    .then((res) => {
      responses.set(res as string);
      return res
    })
    .catch((e) => raise_error(e, false));
}

export const emitBacklog = async () => {
  backlog_in_progress.set(true);
  current_window.emit('send-backlog', 'please...');
}
// Stop listening on the rust side for new requests to mine a proof.
export const killBacklogListener = async () => {
  console.log("kill listener");
  return current_window.emit("kill-backlog-listener")
}

export const getTowerChainView = async () => {
  await invoke("get_onchain_tower_state", {
    account: get(signingAccount).account
  })
    .then((res: EpochRules) => {
      let t = get(tower);
      t.on_chain = res;
      tower.set(t);
      responses.set(JSON.stringify(res));
    })
    .catch((e) => {
      //need to reset, otherwise may be looking at wrong account
      let t = get(tower);
      t.on_chain = {};
      tower.set(t);

      raise_error(e, true)
    });
};

// update the `tower.local_proof`
export const getLocalHeight = async () => {
  await invoke("get_local_height", {})
    .then((res: number) => {
      console.log(res);
      // if res.
      let t = get(tower);
      t.local_height = res;
      tower.set(t);
      responses.set(JSON.stringify(res));
    })
    .catch((e) => {
      let t = get(tower);
      t.local_height = -1;
      tower.set(t);
      raise_error(e, true)
    });
};

export const getEpochRules = async () => {
  await invoke("get_epoch_rules", {})
    .then((res: EpochRules) => {
      console.log(res);
      // if res.
      let t = get(tower);
      t.rules = res;
      tower.set(t);
      responses.set(JSON.stringify(res));
    })
    .catch((e) => {
      raise_error(e, true)
    });
};



export const towerLoop = async () => {
  console.log("starting loop");
  let i = 0;
  // user has to explicitly toggle the miner loop
  // and the backlog cannot be in-progress
  while (get(miner_loop_enabled) && !get(backlog_in_progress)) {
    console.log(i);
    let a = await towerOnce();
    if (!a) break;
    emitBacklog();
    i = i + 1;
  }
}

export const towerOnce = async () => {
  console.log("mine tower once")

  let previous_duration = get(network_profile).chain_id == "Mainnet"
    ? 30 * 60 * 1000
    : 5 * 1000;

  let t = get(tower);
  if (t.progress && t.progress.time_start) {
    previous_duration = Date.now() - t.progress.time_start;
  }

  let progress: ProofProgress = {
    time_start: Date.now(),
    previous_duration,
    complete: false,
    error: false,
    pct_complete: 0
  }
  t.progress = progress;
  tower.set(t);
  
  return invoke("miner_once", {})
    .then(res => {
      console.log('>>> miner_once response: ' + res);
      responses.set(res as string);
      proofComplete()
      return res
    })
    .catch(e => {
      console.log('>>> miner_once error: ' + e);
      raise_error(e, false);
      proofError()
      return false
    });

};


export function proofError() {
  let t = get(tower);
  t.progress.error = true;
  tower.set(t);
}

export function proofComplete() {
  let t = get(tower);
  t.progress.complete = true;
  tower.set(t);
}

// submit any transactions that are in the backlog. Proofs that have been mined but for any reason were not committed.
export const submitBacklog = async () => {
  console.log('>>> submitBacklog called');
  backlog_in_progress.set(true);
  invoke("submit_backlog", {})
    .then(res => {
      backlog_in_progress.set(false);
      console.log('>>> submit_backlog response: ' + res);
      responses.set(res as string);
      return res
    })
    .catch(e => {
      backlog_in_progress.set(false);
      console.log('>>> submit_backlog error: ' + e);
      raise_error(e, false);
    });
}

// For debugging or rescue purposes. Sometimes the user may have a proof that for some reason was not committed to the chain.

export const submitProofZero = async () => {
  backlog_in_progress.set(true);
  invoke("debug_submit_proof_zero", {})
    .then((res) => {
      console.log(res);
      responses.set(res as string);
      return res
    })
    .catch((e) => {
      raise_error(e, false);
    });
}

