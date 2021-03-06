'use strict';

const Amount = require('hsd/lib/ui/amount');
const Address = require('hsd/lib/primitives/address');
const Coin = require('hsd/lib/primitives/coin');
const MTX = require('hsd/lib/primitives/mtx');
const {Script} = require('hsd/lib/script');

const hnsledger = require('../lib/hns-ledger');
const {LedgerHSD, LedgerInput} = hnsledger;
const {Device} = hnsledger.HID;
const Logger = require('blgr');

const util = require('../test/util/fund');

(async () => {
  const devices = await Device.getDevices();

  const logger = new Logger({
    console: true,
    level: 'info'
  });

  await logger.open();

  const device = new Device({
    device: devices[0],
    timeout: 60000,
    logger: logger
  });

  await device.open();

  const accounts = [
    { path: 'm/44\'/5355\'/0\'/0/0' },
    { path: 'm/44\'/5355\'/1\'/0/0' },
    { path: 'm/44\'/5355\'/2\'/0/0' }
  ];

  const ledger = new LedgerHSD({ device, network: 'regtest' });

  for (const acc of accounts) {
    const data = await ledger.getPublicKey(acc.path);
    acc.hd = data.xpub;
    acc.pk = acc.hd.publicKey;
  }

  console.log(`Constructing multisig address...`);

  const [m, n] = [2, accounts.length];
  const [pk1, pk2, pk3] = [ accounts[0].pk, accounts[1].pk, accounts[2].pk];
  const redeem = Script.fromMultisig(m, n, [pk1, pk2, pk3]);
  const address = Address.fromScript(redeem);
  const changeAddress = Address.fromScript(redeem);

  console.log('Constructing spend transaction...');

  const {coins, txs} = await util.fundAddress(address, 1);
  const mtx = new MTX();
  const value = Amount.fromCoins(1).toValue();

  mtx.addOutput({ address, value });
  await mtx.fund(coins, { changeAddress });

  console.log('Constructing LedgerInputs for each input and each signer...');

  const ledgerInputs = [];
  const coin = Coin.fromTX(txs[0], 0, -1);

  ledgerInputs.push(new LedgerInput({
    path: accounts[0].path,
    coin,
    redeem
  }));

  ledgerInputs.push(new LedgerInput({
    path: accounts[1].path,
    coin,
    redeem
  }));

  console.log(`txid: ${mtx.txid()}`);

  const part = await ledger.signTransaction(mtx, [ledgerInputs[0]]);
  const full = await ledger.signTransaction(part, [ledgerInputs[1]]);

  console.log(`valid: ${full.verify()}.`);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
