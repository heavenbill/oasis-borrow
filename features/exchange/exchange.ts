import { ContractDesc } from '@oasisdex/web3-context'
import BigNumber from 'bignumber.js'
import { Context } from 'blockchain/network'
import { getToken } from 'blockchain/tokensMetadata'
import { Observable, of } from 'rxjs'
import { ajax } from 'rxjs/ajax'
import { catchError, debounceTime, distinctUntilChanged, map, retry, switchMap, tap } from 'rxjs/operators'
import { Dictionary } from 'ts-essentials'

import { amountFromWei, amountToWei } from '@oasisdex/utils/lib/src/utils'

const API_ENDPOINT = `https://oasis.api.enterprise.1inch.exchange/v3.0/1/swap`

interface Response {
  fromToken: TokenDescriptor
  toToken: TokenDescriptor
  toTokenAmount: string
  fromTokenAmount: string
  tx: Tx
}

interface TokenDescriptor {
  symbol: string
  name: string
  decimals: number
  eip2612?: boolean
  address: string
  logoURI: string
}

interface Tx {
  from: string
  to: string
  data: string
  value: string
  gasPrice: string
  gas: number
}

export type ExchangeAction = 'BUY_COLLATERAL' | 'SELL_COLLATERAL'

type TokenMetadata = {
  address: string
  decimals: number
  name: string
  symbol: string
}

function getTokenMetaData(symbol: string, tokens: Dictionary<ContractDesc, string>): TokenMetadata {
  const details = getToken(symbol)
  return {
    address: tokens[symbol].address,
    decimals: details.precision,
    symbol,
    name: details.name,
  }
}

function getQuote$(
  dai: TokenMetadata,
  collateral: TokenMetadata,
  account: string,
  amount: BigNumber, // This is always the receiveAtLeast amount of tokens we want to exchange from
  slippage: BigNumber,
  action: ExchangeAction,
) {
  const fromTokenAddress = action === 'BUY_COLLATERAL' ? dai.address : collateral.address
  const toTokenAddress = action === 'BUY_COLLATERAL' ? collateral.address : dai.address

  //TODO: set proper precision depending on token
  const searchParams = new URLSearchParams({
    fromTokenAddress,
    toTokenAddress,
    amount: amountToWei(
      amount,
      action === 'BUY_COLLATERAL' ? dai.decimals : collateral.decimals,
    ).toFixed(0),
    fromAddress: account,
    slippage: slippage.times(100).toString(),
    disableEstimate: 'true',
    allowPartialFill: 'false',
  })

  return ajax(`${API_ENDPOINT}?${searchParams.toString()}`).pipe(
    tap((response) => {
      console.log("request");
      if (response.status !== 200) {
        console.log("failed request");
        throw new Error(response.responseText)
      }
    }),
    map((response): Response => response.response),
    map(({ fromToken, toToken, toTokenAmount, fromTokenAmount, tx }) => {
      const normalizedFromTokenAmount = amountFromWei(
        new BigNumber(fromTokenAmount),
        fromToken.decimals,
      )
      const normalizedToTokenAmount = amountFromWei(new BigNumber(toTokenAmount), toToken.decimals)

      return {
        status: 'SUCCESS' as const,
        fromToken,
        toToken,
        collateralAmount: amountFromWei(
          action === 'BUY_COLLATERAL'
            ? new BigNumber(toTokenAmount)
            : new BigNumber(fromTokenAmount),
          action === 'BUY_COLLATERAL' ? toToken.decimals : fromToken.decimals,
        ),
        daiAmount: amountFromWei(
          action === 'BUY_COLLATERAL'
            ? new BigNumber(fromTokenAmount)
            : new BigNumber(toTokenAmount),
          action === 'BUY_COLLATERAL' ? fromToken.decimals : toToken.decimals,
        ),
        tokenPrice:
          action === 'BUY_COLLATERAL'
            ? normalizedFromTokenAmount.div(normalizedToTokenAmount)
            : normalizedToTokenAmount.div(normalizedFromTokenAmount),
        tx,
      }
    }),
    retry(3),
    catchError(() => of({ status: 'ERROR' as const })),
  )
}

export type Quote = ReturnType<typeof getQuote$> extends Observable<infer R> ? R : never

export function createExchangeQuote$(
  context$: Observable<Context>,
  token: string,
  slippage: BigNumber,
  amount: BigNumber,
  action: ExchangeAction,
) {
  return context$.pipe(
    debounceTime(200),
    switchMap((context) => {
      const { tokens, exchange } = context
      const dai = getTokenMetaData('DAI', tokens)
      const collateral = getTokenMetaData(token, tokens)

      return getQuote$(dai, collateral, exchange.address, amount, slippage, action)
    }),
    distinctUntilChanged((s1, s2) => {
      return JSON.stringify(s1) === JSON.stringify(s2)
    }),
  )
}
