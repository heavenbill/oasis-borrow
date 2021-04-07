/* eslint-disable func-style */
import { TxMeta, TxState, TxStatus } from '@oasisdex/transactions'
import { nullAddress } from '@oasisdex/utils'
import BigNumber from 'bignumber.js'
import { maxUint256 } from 'blockchain/calls/erc20'
import { protoETHAIlkData, protoUSDCAIlkData, protoWBTCAIlkData } from 'blockchain/ilks'
import { ContextConnected, protoContextConnected } from 'blockchain/network'
import { createVault$, Vault } from 'blockchain/vaults'
import { expect } from 'chai'
import { protoTxHelpers, TxHelpers } from 'components/AppContext'
import {
  protoUserETHTokenInfo,
  protoUserUSDCTokenInfo,
  protoUserWBTCTokenInfo,
  UserTokenInfo,
} from 'features/shared/userTokenInfo'
import { getStateUnpacker } from 'helpers/testHelpers'
import { zero } from 'helpers/zero'
import _ from 'lodash'
import { describe, it } from 'mocha'
import { Observable, of } from 'rxjs'
import { first, switchMap } from 'rxjs/operators'

import {
  createManageVault$,
  defaultIsStates,
  ManageVaultEditingStage,
  ManageVaultStage,
  ManageVaultState,
} from './manageVault'
import { validateErrors, validateWarnings } from './manageVaultValidations'

const SLIGHTLY_LESS_THAN_ONE = 0.99
const SLIGHTLY_MORE_THAN_ONE = 1.01

const defaultManageVaultState = {
  stage: 'collateralEditing' as ManageVaultStage,
  originalEditingStage: 'collateralEditing' as ManageVaultEditingStage,
  token: '',
  id: zero,
  ilk: '',
  account: '',
  accountIsController: false,
  errorMessages: [],
  warningMessages: [],
  maxDepositAmount: zero,
  maxDepositAmountUSD: zero,
  maxWithdrawAmount: zero,
  maxWithdrawAmountUSD: zero,
  generateAmountUSD: zero,
  maxGenerateAmount: zero,
  maxPaybackAmount: zero,
  lockedCollateral: zero,
  lockedCollateralPrice: zero,
  debt: zero,
  liquidationPrice: zero,
  collateralizationRatio: zero,
  freeCollateral: zero,
  afterLiquidationPrice: zero,
  afterCollateralizationRatio: zero,
  maxDebtPerUnitCollateral: zero,
  ilkDebtAvailable: zero,
  stabilityFee: zero,
  liquidationPenalty: zero,
  debtFloor: zero,
  liquidationRatio: zero,
  safeConfirmations: 0,
  collateralAllowanceAmount: maxUint256,
  daiAllowanceAmount: maxUint256,
  showDepositAndGenerateOption: false,
  showPaybackAndWithdrawOption: false,
  showIlkDetails: false,
}

describe('manageVault', () => {
  describe('validateWarnings', () => {
    const depositAmount = new BigNumber('10')
    const depositAmountUSD = depositAmount.multipliedBy(
      protoUserWBTCTokenInfo.currentCollateralPrice,
    )
    const withdrawAmount = new BigNumber('10')
    const paybackAmount = new BigNumber('10')
    const manageVaultState = {
      ...defaultIsStates,
      ...defaultManageVaultState,
      ...protoUserWBTCTokenInfo,
      token: 'WBTC',
      proxyAddress: '0xProxyAddress',
      generateAmount: new BigNumber('5000'),
      collateralAllowance: depositAmount,
      daiAllowance: paybackAmount,
      depositAmount,
      depositAmountUSD,
      withdrawAmount,
      paybackAmount,
      injectStateOverride: (_state: Partial<ManageVaultState>) => _.noop(),
    }
    it('Should show no warnings when the state is correct', () => {
      const { warningMessages } = validateWarnings(manageVaultState)
      expect(warningMessages).to.be.an('array').that.is.empty
    })
    it('Should show noProxyAddress warning', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        proxyAddress: undefined,
      })
      expect(warningMessages).to.deep.equal(['noProxyAddress'])
    })
    it('Should show depositAmountEmpty warning', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        depositAmount: undefined,
      })
      expect(warningMessages).to.deep.equal(['depositAmountEmpty'])
    })
    it('Should show generateAmountEmpty warning', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        generateAmount: undefined,
      })
      expect(warningMessages).to.deep.equal(['generateAmountEmpty'])
    })

    it('Should show potentialGenerateAmountLessThanDebtFloor warning when debtFloor is slightly higher that depositAmountUSD', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        debtFloor: manageVaultState.depositAmountUSD.multipliedBy(SLIGHTLY_MORE_THAN_ONE),
      })
      expect(warningMessages).to.deep.equal(['potentialGenerateAmountLessThanDebtFloor'])
    })
    it('Should not show potentialGenerateAmountLessThanDebtFloor warning when debtFloor is slightly lower that depositAmountUSD', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        debtFloor: manageVaultState.depositAmountUSD.multipliedBy(SLIGHTLY_LESS_THAN_ONE),
      })
      expect(warningMessages).to.deep.equal([])
    })
    it('Should show noCollateralAllowance warning when allowance is not set', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        collateralAllowance: undefined,
      })
      expect(warningMessages).to.deep.equal(['noCollateralAllowance'])
    })
    it('Should show collateralAllowanceLessThanDepositAmount warning when allowance is zero', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        collateralAllowance: zero,
      })
      expect(warningMessages).to.deep.equal(['collateralAllowanceLessThanDepositAmount'])
    })
    it('Should show daiAllowanceLessThanPaybackAmount warning when allowance is not enough', () => {
      const { warningMessages } = validateWarnings({
        ...manageVaultState,
        daiAllowance: manageVaultState.paybackAmount.multipliedBy(SLIGHTLY_LESS_THAN_ONE),
      })
      expect(warningMessages).to.deep.equal(['daiAllowanceLessThanPaybackAmount'])
    })
  })

  describe('validateErrors', () => {
    const depositAmount = new BigNumber('10')
    const depositAmountUSD = depositAmount.multipliedBy(
      protoUserWBTCTokenInfo.currentCollateralPrice,
    )
    const maxDepositAmount = depositAmountUSD.multipliedBy(2)
    const ilkDebtAvailable = new BigNumber('50000')
    const debtFloor = new BigNumber('2000')
    const withdrawAmount = new BigNumber('10')
    const paybackAmount = new BigNumber('10')
    const maxPaybackAmount = new BigNumber('10000')
    const debt = new BigNumber(3000)
    const manageVaultState = {
      ...defaultIsStates,
      ...defaultManageVaultState,
      ...protoUserWBTCTokenInfo,
      token: 'WBTC',
      proxyAddress: '0xProxyAddress',
      generateAmount: new BigNumber('5000'),
      collateralAllowance: depositAmount,
      daiAllowance: paybackAmount,
      depositAmount,
      depositAmountUSD,
      withdrawAmount,
      paybackAmount,
      maxDepositAmount,
      debtFloor,
      ilkDebtAvailable,
      maxWithdrawAmount: withdrawAmount,
      maxPaybackAmount,
      debt,
      injectStateOverride: (_state: Partial<ManageVaultState>) => _.noop(),
    }
    it('Should show no errors when the state is correct', () => {
      const { errorMessages } = validateErrors(manageVaultState)
      expect(errorMessages).to.be.an('array').that.is.empty
    })
    it('Should show depositAmountGreaterThanMaxDepositAmount error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        maxDepositAmount: depositAmount.multipliedBy(SLIGHTLY_LESS_THAN_ONE),
      })
      expect(errorMessages).to.deep.equal(['depositAmountGreaterThanMaxDepositAmount'])
    })
    it('Should show withdrawAmountGreaterThanMaxWithdrawAmount error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        maxWithdrawAmount: withdrawAmount.multipliedBy(SLIGHTLY_LESS_THAN_ONE),
      })
      expect(errorMessages).to.deep.equal(['withdrawAmountGreaterThanMaxWithdrawAmount'])
    })
    it('Should show generateAmountLessThanDebtFloor error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        debt: new BigNumber(0),
        generateAmount: new BigNumber(1),
      })
      expect(errorMessages).to.deep.equal(['generateAmountLessThanDebtFloor'])
    })
    it('Should show generateAmountGreaterThanDebtCeiling error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        generateAmount: ilkDebtAvailable.multipliedBy(SLIGHTLY_MORE_THAN_ONE),
      })
      expect(errorMessages).to.deep.equal(['generateAmountGreaterThanDebtCeiling'])
    })
    it('Should show paybackAmountGreaterThanMaxPaybackAmount error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        maxPaybackAmount: paybackAmount.multipliedBy(SLIGHTLY_LESS_THAN_ONE),
      })
      expect(errorMessages).to.deep.equal(['paybackAmountGreaterThanMaxPaybackAmount'])
    })
    it('Should show paybackAmountLessThanDebtFloor error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        paybackAmount: debt.minus(debtFloor).plus(1),
      })
      expect(errorMessages).to.deep.equal(['paybackAmountLessThanDebtFloor'])
    })
    describe('Should validate allowance', () => {
      it('Should show daiAllowanceAmountEmpty error', () => {
        const { errorMessages } = validateErrors({
          ...manageVaultState,
          daiAllowanceAmount: undefined,
          stage: 'daiAllowanceWaitingForConfirmation',
        })
        expect(errorMessages).to.deep.equal(['daiAllowanceAmountEmpty'])
      })
      it('Should show customDaiAllowanceAmountGreaterThanMaxUint256 error', () => {
        const { errorMessages } = validateErrors({
          ...manageVaultState,
          daiAllowanceAmount: maxUint256.plus(1),
          stage: 'daiAllowanceWaitingForConfirmation',
        })
        expect(errorMessages).to.deep.equal(['customDaiAllowanceAmountGreaterThanMaxUint256'])
      })
      it('Should show customDaiAllowanceAmountLessThanPaybackAmount error', () => {
        const { errorMessages } = validateErrors({
          ...manageVaultState,
          daiAllowanceAmount: depositAmount.minus(1),
          stage: 'daiAllowanceWaitingForConfirmation',
        })
        expect(errorMessages).to.deep.equal(['customDaiAllowanceAmountLessThanPaybackAmount'])
      })
    })
    it('Should show vaultUnderCollateralized error', () => {
      const { errorMessages } = validateErrors({
        ...manageVaultState,
        afterCollateralizationRatio: new BigNumber(1.49),
        liquidationRatio: new BigNumber(1.5),
      })
      expect(errorMessages).to.deep.equal(['vaultUnderCollateralized'])
    })
  })
  describe('createManageVault$', () => {
    const protoUrnAddress = '0xEe0b6175705CDFEb824e5092d6547C011EbB46A8'

    interface FixtureProps {
      context?: ContextConnected
      proxyAddress?: string
      allowance?: BigNumber
      vault?: Partial<Vault>
      userTokenInfo?: Partial<UserTokenInfo>
      urnAddress?: string
      owner?: string
      collateral?: BigNumber
      debt?: BigNumber
      unlockedCollateral?: BigNumber
      controller?: string
      depositAmount?: BigNumber
      withdrawAmount?: BigNumber
      generateAmount?: BigNumber
      paybackAmount?: BigNumber
      stage?: ManageVaultStage
      txHelpers?: TxHelpers
      ilk?: 'ETH-A' | 'WBTC-A' | 'USDC-A'
      id?: BigNumber
    }

    function createTestFixture({
      context,
      proxyAddress,
      allowance,
      userTokenInfo,
      urnAddress,
      owner,
      ilk = 'ETH-A',
      collateral = new BigNumber(10),
      debt = new BigNumber(1000),
      unlockedCollateral,
      controller,
      depositAmount,
      withdrawAmount,
      generateAmount,
      paybackAmount,
      txHelpers,
      stage = 'collateralEditing',
      id = zero,
    }: FixtureProps = {}) {
      const protoUserTokenInfo = {
        ...(ilk === 'ETH-A'
          ? protoUserETHTokenInfo
          : ilk === 'WBTC-A'
          ? protoUserWBTCTokenInfo
          : protoUserUSDCTokenInfo),
        ...(userTokenInfo || {}),
      }

      const protoIlkData =
        ilk === 'ETH-A'
          ? protoETHAIlkData
          : ilk === 'WBTC-A'
          ? protoWBTCAIlkData
          : protoUSDCAIlkData

      const newState: Partial<ManageVaultState> = {
        stage,
        ...(depositAmount && {
          depositAmount,
          depositAmountUSD: depositAmount.times(protoUserTokenInfo.currentCollateralPrice),
        }),
        ...(withdrawAmount && {
          withdrawAmount,
          withdrawAmountUSD: withdrawAmount.times(protoUserTokenInfo.currentCollateralPrice),
        }),
        ...(generateAmount && {
          generateAmount,
        }),
        ...(paybackAmount && {
          paybackAmount,
        }),
      }

      const context$ = of(context || protoContextConnected)
      const txHelpers$ = of(txHelpers || protoTxHelpers)
      const proxyAddress$ = () => of(proxyAddress)
      const allowance$ = () => of(allowance || maxUint256)

      const userTokenInfo$ = () => of(protoUserTokenInfo)

      const oraclePriceData$ = () =>
        of(protoUserTokenInfo).pipe(
          switchMap(({ currentCollateralPrice }) =>
            of({ currentPrice: currentCollateralPrice, isStaticPrice: true }),
          ),
        )

      const ilkData$ = () => of(protoIlkData)

      const normalizedDebt = debt
        .div(protoIlkData.debtScalingFactor)
        .decimalPlaces(18, BigNumber.ROUND_DOWN)

      const cdpManagerUrns$ = () => of(urnAddress || protoUrnAddress)
      const cdpManagerIlks$ = () => of(ilk || 'ETH-A')
      const cdpManagerOwner$ = () => of(owner || proxyAddress || nullAddress)

      const vatUrns$ = () => of({ collateral, normalizedDebt })
      const vatGem$ = () => of(unlockedCollateral || zero)

      const controller$ = () => of(controller || context?.account || protoContextConnected.account)
      const ilkToToken$ = of((ilk: string) => ilk.split('-')[0])

      const vault$ = () =>
        createVault$(
          cdpManagerUrns$,
          cdpManagerIlks$,
          cdpManagerOwner$,
          vatUrns$,
          vatGem$,
          ilkData$,
          oraclePriceData$,
          controller$,
          ilkToToken$,
          id,
        )

      const manageVault$ = createManageVault$(
        context$,
        txHelpers$,
        proxyAddress$,
        allowance$,
        userTokenInfo$,
        ilkData$,
        vault$,
        id,
      )
      manageVault$.pipe(first()).subscribe(({ injectStateOverride }) => {
        injectStateOverride(newState || {})
      })
      return manageVault$
    }

    function createMockTxState<T extends TxMeta>(
      meta: T,
      status: TxStatus = TxStatus.Success,
      receipt: unknown = {},
    ): Observable<TxState<T>> {
      if (status === TxStatus.Success) {
        const txState = {
          account: '0x',
          txNo: 0,
          networkId: '1',
          meta,
          start: new Date(),
          lastChange: new Date(),
          dismissed: false,
          status,
          txHash: '0xhash',
          blockNumber: 0,
          receipt,
          confirmations: 15,
          safeConfirmations: 15,
        }
        return of(txState)
      } else if (status === TxStatus.Failure) {
        const txState = {
          account: '0x',
          txNo: 0,
          networkId: '1',
          meta,
          start: new Date(),
          lastChange: new Date(),
          dismissed: false,
          status,
          txHash: '0xhash',
          blockNumber: 0,
          receipt,
        }
        return of(txState)
      } else {
        throw new Error('Not implemented yet')
      }
    }

    it('Should start in an editing stage', () => {
      const state = getStateUnpacker(createTestFixture())
      const s = state()
      expect(s.stage).to.be.equal('collateralEditing')
      expect(s.isEditingStage).to.be.true
    })

    it('editing.change()', () => {
      const depositAmount = new BigNumber(5)
      const state = getStateUnpacker(createTestFixture())
      ;(state() as ManageVaultState).updateDeposit!(depositAmount)
      expect((state() as ManageVaultState).depositAmount!.toString()).to.be.equal(
        depositAmount.toString(),
      )
      expect(state().isEditingStage).to.be.true
    })

    it('editing.progress()', () => {
      const state = getStateUnpacker(createTestFixture())
      ;(state() as ManageVaultState).progress!()
      expect(state().isProxyStage).to.be.true
      expect(state().stage).to.be.equal('proxyWaitingForConfirmation')
    })

    it('editing.progress(proxyAddress)', () => {
      const state = getStateUnpacker(createTestFixture({ proxyAddress: '0xProxyAddress' }))
      ;(state() as ManageVaultState).progress!()
      expect(state().isManageStage).to.be.true
      expect(state().stage).to.be.equal('manageWaitingForConfirmation')
    })

    it('editing.progress(proxyAddress)', () => {
      const state = getStateUnpacker(createTestFixture({ proxyAddress: '0xProxyAddress' }))
      ;(state() as ManageVaultState).progress!()
      expect(state().isManageStage).to.be.true
      expect(state().stage).to.be.equal('manageWaitingForConfirmation')
    })

    it('manageWaitingForConfirmation.progress()', () => {
      const state = getStateUnpacker(
        createTestFixture({
          proxyAddress: '0xProxyAddress',
          txHelpers: {
            ...protoTxHelpers,
            send: <B extends TxMeta>(_open: any, meta: B) => createMockTxState(meta),
          },
        }),
      )
      ;(state() as ManageVaultState).progress!()
      expect(state().isManageStage).to.be.true
      expect(state().stage).to.be.equal('manageWaitingForConfirmation')
      ;(state() as ManageVaultState).progress!()
      expect(state().isManageStage).to.be.true
      expect(state().stage).to.be.equal('manageSuccess')
    })
  })
})