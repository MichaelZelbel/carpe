import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/tauri';
import { raise_error } from './carpeError';
import { responses } from './debug';
import { minerLoopEnabled, tower} from "./miner";
import { notify_success, notify_error } from './carpeNotify';
import { AccountEntry, all_accounts, isInit, isRefreshingAccounts, mnem, signingAccount, accountEvents, isAccountsLoaded } from './accounts';

export const loadAccounts = async () => { 
  // fetch data from local DB
  return invoke('get_all_accounts')
    .then((result: object) => {
      all_accounts.set(result.accounts);
      
      if (get(signingAccount).account == "" && result.accounts.length > 0) {
        // set initial signingAccount
        let first = result.accounts[0];
        setAccount(first.account, false);
      } else {
        /* TODO no accounts in the current network
        signingAccount.set(new_account("", "", ""));
        */
      }
      if (!get(isAccountsLoaded)) {
        isAccountsLoaded.set(true);
      }
      // fetch data from the chain
      return refreshAccounts();
    })
    .catch((error) => raise_error(error, false, "loadAccounts"))
}

export const refreshAccounts = async () => {
  isRefreshingAccounts.set(true);
  return invoke('refresh_accounts')
    .then((result: object) => { // TODO make this the correct return type
      all_accounts.set(result.accounts);
      result.accounts.forEach(el => {
        tryRefreshSignerAccount(el);
      });
      isRefreshingAccounts.set(false);
    })
    .catch(_ => {
      isRefreshingAccounts.set(false);
    })
}

export function tryRefreshSignerAccount(newData: AccountEntry) {
  let a = get(signingAccount).account;
  if (newData.account == a) {
    signingAccount.set(newData);
  }
}


export const isCarpeInit = async () => {
  invoke("is_init", {})
    .then((res: boolean) => {
      responses.set(res.toString());
      isInit.set(res);
      // for testnet
      res
    })
    .catch((e) => raise_error(e, false, "isCarpeInit"));
}

export function findOneAccount(account: string): AccountEntry {
  let list = get(all_accounts);
  let found = list.find((i) => i.account == account)
  return found
}

export const setAccount = async (an_address: string, notifySucess = true) => { 
  if (get(signingAccount).account == an_address) {
    return
  }
 
  // cannot switch profile with miner running
  if (get(minerLoopEnabled)) {
    notify_error("To switch accounts you need to turn miner off first.");
    return
  }

  let a = findOneAccount(an_address);

  // optimistic switch
  let previous = get(signingAccount);
  signingAccount.set(a);
 
  // reset user data
  tower.set({});
  mnem.set("");
  
  // initi account events for better UX
  getAccountEvents(a);
  
  invoke("switch_profile", {
    account: a.account,
  })
  .then((res) => {
    responses.set(res);
    if (notifySucess) {
      notify_success("Account switched to " + a.nickname);
    }
  })
  .catch((e) => {
    raise_error(e, false, "setAccount");
    
    // fallback optimistic change
    signingAccount.set(previous);
  });
}

export function addNewAccount(account: AccountEntry) {
  let list = get(all_accounts);
  account.on_chain = false;
  list.push(account);    
  all_accounts.set(list);
}

export function checkSigningAccountBalance() {
  let selected = get(signingAccount);
  invoke('query_balance', {account: selected.account})
    .then((balance: number) => {
      // update signingAccount
      selected.on_chain = true;
      selected.balance = Number(balance);
      signingAccount.set(selected);
      
      // update all accounts set
      let list = get(all_accounts).map(each => {
        if (each.account == selected.account) {
          each.on_chain = true;
          each.balance = Number(balance);
        }
        return each;
      });
      all_accounts.set(list);
    })
    .catch((e) => raise_error(e, false, "checkSigningAccountBalance"));
}

export function getAccountEvents(account: AccountEntry, errorCallback = null) {
  const address = account.account;
  
  if (!account.on_chain) {
    return errorCallback && errorCallback("account_not_on_chain");
  }

  invoke('get_account_events', {account: address.toUpperCase()})
    .then((events: Array<T>) => {
      let all = get(accountEvents);     
      all[address] = events
        .sort((a, b) => (a.transaction_version < b.transaction_version)
          ? 1
          : (b.transaction_version < a.transaction_version)
            ? -1
            : 0
        );
      accountEvents.set(all);
    })
    .catch(e => {
      if (errorCallback) {
        errorCallback(e.msg);
      } else {
        raise_error(e, false, "getAccountEvents");
      }      
    });
}

export function get_locale(): string {
  let lang = 'en-US';
  if (window.navigator.language) {
    lang = window.navigator.language;
  };
  return lang 
}