import type { WorkoutGoal } from './types';

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

export const WORKOUT_GOAL_LABELS: Record<WorkoutGoal, { label: string; emoji: string }> = {
  lose_weight: { label: 'Lose Weight', emoji: '🏃' },
  build_muscle: { label: 'Build Muscle', emoji: '🏋️' },
  stay_active: { label: 'Stay Active', emoji: '✨' },
  improve_endurance: { label: 'Improve Endurance', emoji: '💪' },
  reduce_stress: { label: 'Reduce Stress', emoji: '🧘' },
};
