import { maxUint256 } from 'blockchain/calls/erc20'
import { isNullish } from 'helpers/functions'
import { UnreachableCaseError } from 'helpers/UnreachableCaseError'
import { zero } from 'helpers/zero'

import { ManageVaultStage, ManageVaultState } from './manageVault'

const defaultManageVaultStageCategories = {
  isEditingStage: false,
  isProxyStage: false,
  isCollateralAllowanceStage: false,
  isDaiAllowanceStage: false,
  isManageStage: false,
  isMultiplyTransitionStage: false,
}

export function applyManageVaultStageCategorisation(state: ManageVaultState) {
  const {
    stage,
    vault: { token, debtOffset },
    depositAmount,
    daiAllowance,
    collateralAllowance,
    paybackAmount,
    initialTotalSteps,
  } = state
  const isDepositZero = depositAmount ? depositAmount.eq(zero) : true
  const isPaybackZero = paybackAmount ? paybackAmount.eq(zero) : true

  const depositAmountLessThanCollateralAllowance =
    collateralAllowance && depositAmount && collateralAllowance.gte(depositAmount)

  const paybackAmountLessThanDaiAllowance =
    daiAllowance && paybackAmount && daiAllowance.gte(paybackAmount.plus(debtOffset))

  const hasCollateralAllowance =
    token === 'ETH' ? true : depositAmountLessThanCollateralAllowance || isDepositZero

  const hasDaiAllowance = paybackAmountLessThanDaiAllowance || isPaybackZero

  let totalSteps = initialTotalSteps

  if (initialTotalSteps === 2 && (!hasCollateralAllowance || !hasDaiAllowance)) {
    totalSteps = 3
  }

  if (initialTotalSteps === 3 && hasCollateralAllowance && hasDaiAllowance && !isPaybackZero) {
    totalSteps = 2
  }

  switch (stage) {
    case 'collateralEditing':
    case 'daiEditing':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isEditingStage: true,
        totalSteps,
        currentStep: 1,
      }
    case 'proxyWaitingForConfirmation':
    case 'proxyWaitingForApproval':
    case 'proxyInProgress':
    case 'proxyFailure':
    case 'proxySuccess':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isProxyStage: true,
        totalSteps,
        currentStep: totalSteps - (token === 'ETH' ? 1 : 2),
      }
    case 'collateralAllowanceWaitingForConfirmation':
    case 'collateralAllowanceWaitingForApproval':
    case 'collateralAllowanceInProgress':
    case 'collateralAllowanceFailure':
    case 'collateralAllowanceSuccess':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isCollateralAllowanceStage: true,
        totalSteps,
        currentStep: totalSteps - 1,
      }
    case 'daiAllowanceWaitingForConfirmation':
    case 'daiAllowanceWaitingForApproval':
    case 'daiAllowanceInProgress':
    case 'daiAllowanceFailure':
    case 'daiAllowanceSuccess':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isDaiAllowanceStage: true,
        totalSteps,
        currentStep: totalSteps - 1,
      }

    case 'manageWaitingForConfirmation':
    case 'manageWaitingForApproval':
    case 'manageInProgress':
    case 'manageFailure':
    case 'manageSuccess':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isManageStage: true,
        totalSteps,
        currentStep: totalSteps,
      }
    case 'multiplyTransitionEditing':
    case 'multiplyTransitionWaitingForConfirmation':
    case 'multiplyTransitionInProgress':
    case 'multiplyTransitionFailure':
    case 'multiplyTransitionSuccess':
      return {
        ...state,
        ...defaultManageVaultStageCategories,
        isMultiplyTransitionStage: true,
        totalSteps: 2,
        currentStep: stage === 'multiplyTransitionEditing' ? 1 : 2,
      }
    default:
      throw new UnreachableCaseError(stage)
  }
}

export interface ManageVaultConditions {
  isEditingStage: boolean
  isProxyStage: boolean
  isCollateralAllowanceStage: boolean
  isDaiAllowanceStage: boolean
  isManageStage: boolean
  isMultiplyTransitionStage: boolean

  canProgress: boolean
  canRegress: boolean

  depositAndWithdrawAmountsEmpty: boolean
  generateAndPaybackAmountsEmpty: boolean
  inputAmountsEmpty: boolean

  vaultWillBeAtRiskLevelWarning: boolean
  vaultWillBeAtRiskLevelDanger: boolean
  vaultWillBeUnderCollateralized: boolean

  vaultWillBeAtRiskLevelWarningAtNextPrice: boolean
  vaultWillBeAtRiskLevelDangerAtNextPrice: boolean
  vaultWillBeUnderCollateralizedAtNextPrice: boolean

  accountIsConnected: boolean
  accountIsController: boolean

  depositingAllEthBalance: boolean
  depositAmountExceedsCollateralBalance: boolean
  withdrawAmountExceedsFreeCollateral: boolean
  withdrawAmountExceedsFreeCollateralAtNextPrice: boolean
  generateAmountExceedsDaiYieldFromTotalCollateral: boolean
  generateAmountExceedsDaiYieldFromTotalCollateralAtNextPrice: boolean
  generateAmountLessThanDebtFloor: boolean
  generateAmountExceedsDebtCeiling: boolean
  paybackAmountExceedsVaultDebt: boolean
  paybackAmountExceedsDaiBalance: boolean

  debtWillBeLessThanDebtFloor: boolean
  isLoadingStage: boolean

  insufficientCollateralAllowance: boolean
  customCollateralAllowanceAmountEmpty: boolean
  customCollateralAllowanceAmountExceedsMaxUint256: boolean
  customCollateralAllowanceAmountLessThanDepositAmount: boolean

  insufficientDaiAllowance: boolean
  customDaiAllowanceAmountEmpty: boolean
  customDaiAllowanceAmountExceedsMaxUint256: boolean
  customDaiAllowanceAmountLessThanPaybackAmount: boolean
  withdrawCollateralOnVaultUnderDebtFloor: boolean
  depositCollateralOnVaultUnderDebtFloor: boolean
}

export const defaultManageVaultConditions: ManageVaultConditions = {
  ...defaultManageVaultStageCategories,
  canProgress: false,
  canRegress: false,

  vaultWillBeAtRiskLevelWarning: false,
  vaultWillBeAtRiskLevelDanger: false,
  vaultWillBeUnderCollateralized: false,

  vaultWillBeAtRiskLevelWarningAtNextPrice: false,
  vaultWillBeAtRiskLevelDangerAtNextPrice: false,
  vaultWillBeUnderCollateralizedAtNextPrice: false,

  depositAndWithdrawAmountsEmpty: true,
  generateAndPaybackAmountsEmpty: true,
  inputAmountsEmpty: true,

  accountIsConnected: false,
  accountIsController: false,

  depositingAllEthBalance: false,
  depositAmountExceedsCollateralBalance: false,
  withdrawAmountExceedsFreeCollateral: false,
  withdrawAmountExceedsFreeCollateralAtNextPrice: false,
  generateAmountExceedsDaiYieldFromTotalCollateral: false,
  generateAmountExceedsDaiYieldFromTotalCollateralAtNextPrice: false,
  generateAmountLessThanDebtFloor: false,
  generateAmountExceedsDebtCeiling: false,
  paybackAmountExceedsVaultDebt: false,
  paybackAmountExceedsDaiBalance: false,

  debtWillBeLessThanDebtFloor: false,
  isLoadingStage: false,

  insufficientCollateralAllowance: false,
  customCollateralAllowanceAmountEmpty: false,
  customCollateralAllowanceAmountExceedsMaxUint256: false,
  customCollateralAllowanceAmountLessThanDepositAmount: false,

  insufficientDaiAllowance: false,
  customDaiAllowanceAmountEmpty: false,
  customDaiAllowanceAmountExceedsMaxUint256: false,
  customDaiAllowanceAmountLessThanPaybackAmount: false,

  withdrawCollateralOnVaultUnderDebtFloor: false,
  depositCollateralOnVaultUnderDebtFloor: false,
}

export function applyManageVaultConditions(state: ManageVaultState): ManageVaultState {
  const {
    depositAmount,
    generateAmount,
    withdrawAmount,
    paybackAmount,
    afterCollateralizationRatio,
    afterCollateralizationRatioAtNextPrice,
    ilkData,
    vault,
    account,
    stage,
    selectedCollateralAllowanceRadio,
    selectedDaiAllowanceRadio,
    collateralAllowanceAmount,
    daiAllowanceAmount,
    collateralAllowance,
    daiAllowance,
    shouldPaybackAll,
    balanceInfo: { collateralBalance, daiBalance },
    isEditingStage,
    isCollateralAllowanceStage,
    isDaiAllowanceStage,
    maxWithdrawAmountAtCurrentPrice,
    maxWithdrawAmountAtNextPrice,
    maxGenerateAmountAtCurrentPrice,
    maxGenerateAmountAtNextPrice,
    isMultiplyTransitionStage,
    afterDebt,
  } = state

  const depositAndWithdrawAmountsEmpty = isNullish(depositAmount) && isNullish(withdrawAmount)
  const generateAndPaybackAmountsEmpty = isNullish(generateAmount) && isNullish(paybackAmount)

  const inputAmountsEmpty = depositAndWithdrawAmountsEmpty && generateAndPaybackAmountsEmpty

  const vaultWillBeAtRiskLevelDanger =
    !inputAmountsEmpty &&
    afterCollateralizationRatio.gte(ilkData.liquidationRatio) &&
    afterCollateralizationRatio.lte(ilkData.collateralizationDangerThreshold)

  const vaultWillBeAtRiskLevelDangerAtNextPrice =
    !vaultWillBeAtRiskLevelDanger &&
    !inputAmountsEmpty &&
    afterCollateralizationRatioAtNextPrice.gte(ilkData.liquidationRatio) &&
    afterCollateralizationRatioAtNextPrice.lte(ilkData.collateralizationDangerThreshold)

  const vaultWillBeAtRiskLevelWarning =
    !inputAmountsEmpty &&
    afterCollateralizationRatio.gt(ilkData.collateralizationDangerThreshold) &&
    afterCollateralizationRatio.lte(ilkData.collateralizationWarningThreshold)

  const vaultWillBeAtRiskLevelWarningAtNextPrice =
    !vaultWillBeAtRiskLevelWarning &&
    !inputAmountsEmpty &&
    afterCollateralizationRatioAtNextPrice.gt(ilkData.collateralizationDangerThreshold) &&
    afterCollateralizationRatioAtNextPrice.lte(ilkData.collateralizationWarningThreshold)

  const vaultWillBeUnderCollateralized =
    !inputAmountsEmpty &&
    afterCollateralizationRatio.lt(ilkData.liquidationRatio) &&
    !afterCollateralizationRatio.isZero()

  const vaultWillBeUnderCollateralizedAtNextPrice =
    !vaultWillBeUnderCollateralized &&
    !inputAmountsEmpty &&
    afterCollateralizationRatioAtNextPrice.lt(ilkData.liquidationRatio) &&
    !afterCollateralizationRatioAtNextPrice.isZero()

  const accountIsConnected = !!account
  const accountIsController = accountIsConnected ? account === vault.controller : true

  const depositAmountExceedsCollateralBalance = !!depositAmount?.gt(collateralBalance)

  const depositingAllEthBalance = vault.token === 'ETH' && !!depositAmount?.eq(collateralBalance)

  const withdrawAmountExceedsFreeCollateral = !!withdrawAmount?.gt(maxWithdrawAmountAtCurrentPrice)

  const withdrawAmountExceedsFreeCollateralAtNextPrice =
    !withdrawAmountExceedsFreeCollateral && !!withdrawAmount?.gt(maxWithdrawAmountAtNextPrice)

  const generateAmountExceedsDebtCeiling = !!generateAmount?.gt(ilkData.ilkDebtAvailable)

  const generateAmountExceedsDaiYieldFromTotalCollateral =
    !generateAmountExceedsDebtCeiling && !!generateAmount?.gt(maxGenerateAmountAtCurrentPrice)

  const generateAmountExceedsDaiYieldFromTotalCollateralAtNextPrice =
    !generateAmountExceedsDebtCeiling &&
    !generateAmountExceedsDaiYieldFromTotalCollateral &&
    !!generateAmount?.gt(maxGenerateAmountAtNextPrice)

  const generateAmountLessThanDebtFloor = !!(
    generateAmount &&
    !generateAmount.plus(vault.debt).isZero() &&
    generateAmount.plus(vault.debt).lt(ilkData.debtFloor)
  )

  const paybackAmountExceedsDaiBalance = !!paybackAmount?.gt(daiBalance)
  const paybackAmountExceedsVaultDebt = !!paybackAmount?.gt(vault.debt)

  const debtWillBeLessThanDebtFloor = !!(
    paybackAmount &&
    vault.debt.minus(paybackAmount).lt(ilkData.debtFloor) &&
    vault.debt.minus(paybackAmount).gt(zero) &&
    !shouldPaybackAll
  )

  const customCollateralAllowanceAmountEmpty =
    selectedCollateralAllowanceRadio === 'custom' && !collateralAllowanceAmount

  const customDaiAllowanceAmountEmpty =
    selectedDaiAllowanceRadio === 'custom' && !daiAllowanceAmount

  const customCollateralAllowanceAmountExceedsMaxUint256 = !!(
    selectedCollateralAllowanceRadio === 'custom' && collateralAllowanceAmount?.gt(maxUint256)
  )

  const customCollateralAllowanceAmountLessThanDepositAmount = !!(
    selectedCollateralAllowanceRadio === 'custom' &&
    collateralAllowanceAmount &&
    depositAmount &&
    collateralAllowanceAmount.lt(depositAmount)
  )

  const customDaiAllowanceAmountExceedsMaxUint256 = !!(
    selectedDaiAllowanceRadio === 'custom' && daiAllowanceAmount?.gt(maxUint256)
  )

  const customDaiAllowanceAmountLessThanPaybackAmount = !!(
    selectedDaiAllowanceRadio === 'custom' &&
    daiAllowanceAmount &&
    paybackAmount &&
    daiAllowanceAmount.lt(paybackAmount)
  )

  const insufficientCollateralAllowance =
    vault.token !== 'ETH' &&
    !!(
      depositAmount &&
      !depositAmount.isZero() &&
      (!collateralAllowance || depositAmount.gt(collateralAllowance))
    )

  const insufficientDaiAllowance = !!(
    paybackAmount &&
    !paybackAmount.isZero() &&
    (!daiAllowance || paybackAmount.plus(vault.debtOffset).gt(daiAllowance))
  )

  const isLoadingStage = ([
    'proxyInProgress',
    'proxyWaitingForApproval',
    'collateralAllowanceWaitingForApproval',
    'collateralAllowanceInProgress',
    'daiAllowanceWaitingForApproval',
    'daiAllowanceInProgress',
    'manageInProgress',
    'manageWaitingForApproval',
    'multiplyTransitionInProgress',
    'multiplyTransitionSuccess',
  ] as ManageVaultStage[]).some((s) => s === stage)

  const withdrawCollateralOnVaultUnderDebtFloor =
    vault.debt.gt(zero) &&
    vault.debt.lt(ilkData.debtFloor) &&
    withdrawAmount !== undefined &&
    withdrawAmount.gt(zero) &&
    (paybackAmount === undefined || paybackAmount.lt(vault.debt))

  const depositCollateralOnVaultUnderDebtFloor =
    vault.debt.gt(zero) &&
    vault.debt.lt(ilkData.debtFloor) &&
    depositAmount !== undefined &&
    depositAmount.lt(ilkData.debtFloor) &&
    afterDebt.lt(ilkData.debtFloor)

  const editingProgressionDisabled =
    isEditingStage &&
    (inputAmountsEmpty ||
      !vault.controller ||
      !accountIsConnected ||
      vaultWillBeUnderCollateralized ||
      vaultWillBeUnderCollateralizedAtNextPrice ||
      debtWillBeLessThanDebtFloor ||
      depositAmountExceedsCollateralBalance ||
      withdrawAmountExceedsFreeCollateral ||
      withdrawAmountExceedsFreeCollateralAtNextPrice ||
      depositingAllEthBalance ||
      generateAmountExceedsDebtCeiling ||
      generateAmountLessThanDebtFloor ||
      paybackAmountExceedsDaiBalance ||
      paybackAmountExceedsVaultDebt ||
      withdrawCollateralOnVaultUnderDebtFloor ||
      depositCollateralOnVaultUnderDebtFloor)

  const collateralAllowanceProgressionDisabled =
    isCollateralAllowanceStage &&
    (customCollateralAllowanceAmountEmpty ||
      customCollateralAllowanceAmountExceedsMaxUint256 ||
      customCollateralAllowanceAmountLessThanDepositAmount)

  const daiAllowanceProgressionDisabled =
    isDaiAllowanceStage &&
    (customDaiAllowanceAmountEmpty ||
      customDaiAllowanceAmountExceedsMaxUint256 ||
      customDaiAllowanceAmountLessThanPaybackAmount)

  const multiplyTransitionDisabled = isMultiplyTransitionStage && !accountIsController

  const canProgress = !(
    isLoadingStage ||
    editingProgressionDisabled ||
    collateralAllowanceProgressionDisabled ||
    daiAllowanceProgressionDisabled ||
    multiplyTransitionDisabled
  )

  const canRegress = ([
    'proxyWaitingForConfirmation',
    'proxyFailure',
    'collateralAllowanceWaitingForConfirmation',
    'collateralAllowanceFailure',
    'daiAllowanceWaitingForConfirmation',
    'daiAllowanceFailure',
    'manageWaitingForConfirmation',
    'manageFailure',
    'multiplyTransitionEditing',
    'multiplyTransitionWaitingForConfirmation',
    'multiplyTransitionFailure',
  ] as ManageVaultStage[]).some((s) => s === stage)

  return {
    ...state,
    canProgress,
    canRegress,

    depositAndWithdrawAmountsEmpty,
    generateAndPaybackAmountsEmpty,
    inputAmountsEmpty,

    vaultWillBeAtRiskLevelWarning,
    vaultWillBeAtRiskLevelWarningAtNextPrice,
    vaultWillBeAtRiskLevelDanger,
    vaultWillBeAtRiskLevelDangerAtNextPrice,
    vaultWillBeUnderCollateralized,
    vaultWillBeUnderCollateralizedAtNextPrice,

    accountIsConnected,
    accountIsController,
    depositingAllEthBalance,
    generateAmountExceedsDebtCeiling,
    depositAmountExceedsCollateralBalance,
    withdrawAmountExceedsFreeCollateral,
    withdrawAmountExceedsFreeCollateralAtNextPrice,
    generateAmountExceedsDaiYieldFromTotalCollateral,
    generateAmountExceedsDaiYieldFromTotalCollateralAtNextPrice,
    generateAmountLessThanDebtFloor,
    paybackAmountExceedsDaiBalance,
    paybackAmountExceedsVaultDebt,
    shouldPaybackAll,
    debtWillBeLessThanDebtFloor,
    isLoadingStage,

    insufficientCollateralAllowance,
    customCollateralAllowanceAmountEmpty,
    customCollateralAllowanceAmountExceedsMaxUint256,
    customCollateralAllowanceAmountLessThanDepositAmount,

    insufficientDaiAllowance,
    customDaiAllowanceAmountEmpty,
    customDaiAllowanceAmountExceedsMaxUint256,
    customDaiAllowanceAmountLessThanPaybackAmount,

    withdrawCollateralOnVaultUnderDebtFloor,
    depositCollateralOnVaultUnderDebtFloor,
  }
}
