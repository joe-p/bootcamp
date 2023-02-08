import algosdk from 'algosdk'
import { Auction } from './beaker/auction_client'
import { MyAlgoSession } from './wallets/myalgo'

const myAlgo = new MyAlgoSession()
const algodClient = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
let auctionAppId: number

const accountsMenu = document.getElementById('accounts') as HTMLSelectElement
const amountInput = document.getElementById('amount') as HTMLInputElement
const asaInput = document.getElementById('asa') as HTMLInputElement
const asaAmountInput = document.getElementById('asa-amount') as HTMLInputElement
const buttonIds = ['create', 'connect', 'start', 'bid']
const buttons: { [key: string]: HTMLButtonElement } = {}
buttonIds.forEach(id => {
  buttons[id] = document.getElementById(id) as HTMLButtonElement
})

async function signer (txns: algosdk.Transaction[]) {
  const sTxns = await myAlgo.signTxns(txns)
  return sTxns.map(s => s.blob)
}

buttons.connect.onclick = async () => {
  await myAlgo.getAccounts()
  buttons.create.disabled = false
  myAlgo.accounts.forEach(account => {
    accountsMenu.add(new Option(`${account.name} - ${account.address}`, account.address))
  })
}

buttons.create.onclick = async () => {
  document.getElementById('status').innerHTML = 'Creating auction app...'
  const sender = accountsMenu.selectedOptions[0].value

  const auctionApp = new Auction({
    client: algodClient,
    sender,
    signer
  })

  const { appId, appAddress, txId } = await auctionApp.create()
  auctionAppId = appId

  document.getElementById('status').innerHTML = `App created with id ${appId} and address ${appAddress} in tx ${txId}. See it <a href='https://testnet.algoexplorer.io/application/${appId}'>here</a>`
  buttons.start.disabled = false
  buttons.create.disabled = true
}

buttons.start.onclick = async () => {
  document.getElementById('status').innerHTML = 'Starting auction...'
  const sender = accountsMenu.selectedOptions[0].value
  const asa = asaInput.valueAsNumber

  const auctionApp = new Auction({
    client: algodClient,
    sender,
    signer,
    appId: auctionAppId
  })

  const suggestedParams = await algodClient.getTransactionParams().do()
  const atc = new algosdk.AtomicTransactionComposer()

  const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams,
    amount: 200_000,
    from: sender,
    to: algosdk.getApplicationAddress(auctionAppId)
  })
  atc.addTransaction({ txn: payment, signer })

  atc.addMethodCall({
    appID: auctionAppId,
    method: algosdk.getMethodByName(auctionApp.methods, 'opt_into_asset'),
    sender,
    signer,
    suggestedParams: { ...suggestedParams, fee: 2_000, flatFee: true },
    methodArgs: [asa]
  })

  const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    suggestedParams,
    from: sender,
    amount: asaAmountInput.valueAsNumber,
    to: algosdk.getApplicationAddress(auctionAppId),
    assetIndex: asa
  })

  atc.addMethodCall({
    appID: auctionAppId,
    method: algosdk.getMethodByName(auctionApp.methods, 'start_auction'),
    sender,
    signer,
    suggestedParams,
    methodArgs: [amountInput.valueAsNumber, 360_000, { txn: axfer, signer }]
  })

  await atc.execute(algodClient, 3)

  document.getElementById('status').innerHTML = `Auction started! See the app <a href='https://testnet.algoexplorer.io/application/${auctionAppId}'>here</a>`

  buttons.bid.disabled = false
  buttons.start.disabled = true
}

buttons.bid.onclick = async () => {
  document.getElementById('status').innerHTML = 'Sending bid...'

  const auctionApp = new Auction({
    client: algodClient,
    sender: accountsMenu.selectedOptions[0].value,
    signer,
    appId: auctionAppId
  })

  const suggestedParams = await algodClient.getTransactionParams().do()
  suggestedParams.fee = 2_000
  suggestedParams.flatFee = true

  const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams,
    amount: amountInput.valueAsNumber,
    from: accountsMenu.selectedOptions[0].value,
    to: algosdk.getApplicationAddress(auctionAppId)
  })

  const rawState = await auctionApp.getApplicationState(true)
  console.log(rawState, await auctionApp.getApplicationState())
  const rawHighestBidder = rawState['686967686573745f626964646572'] as Uint8Array

  let prevBidder: string

  if (rawHighestBidder.byteLength === 0) {
    prevBidder = accountsMenu.selectedOptions[0].value
  } else {
    prevBidder = algosdk.encodeAddress(rawHighestBidder)
  }

  await auctionApp.bid({
    payment,
    previous_bidder: prevBidder
  })

  document.getElementById('status').innerHTML = `Bid sent! See the app <a href='https://testnet.algoexplorer.io/application/${auctionAppId}'>here</a>`
}
