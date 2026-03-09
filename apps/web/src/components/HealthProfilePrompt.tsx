'use client';

import { useState, useEffect } from 'react';
import type { WorkoutGoal } from '@burnbuddy/shared';
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLbs,
  lbsToKg,
  WORKOUT_GOAL_LABELS,
} from '@burnbuddy/shared';
import { apiPut } from '@/lib/api';

interface HealthProfilePromptProps {
  onComplete: () => void;
}

export function HealthProfilePrompt({ onComplete }: HealthProfilePromptProps) {
  const [unitPref, setUnitPref] = useState<'metric' | 'imperial'>('metric');
  const [heightCm, setHeightCm] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [dob, setDob] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<WorkoutGoal | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && /^en-(US|GB|LR|MM)/.test(navigator.language)) {
      setUnitPref('imperial');
    }
  }, []);

  const handleUnitChange = (unit: 'metric' | 'imperial') => {
    setUnitPref(unit);
    if (unit === 'imperial' && heightCm) {
      const { feet, inches } = cmToFeetInches(Number(heightCm));
      setHeightFeet(String(feet));
      setHeightInches(String(inches));
    }
    if (unit === 'metric' && (heightFeet || heightInches)) {
      const cm = feetInchesToCm(Number(heightFeet) || 0, Number(heightInches) || 0);
      if (cm > 0) setHeightCm(String(cm));
    }
    if (unit === 'imperial' && weightValue) {
      setWeightValue(String(kgToLbs(Number(weightValue))));
    }
    if (unit === 'metric' && weightValue) {
      setWeightValue(String(lbsToKg(Number(weightValue))));
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await apiPut('/users/me', { healthProfilePromptDismissed: true });
    } catch {
      // non-fatal
    }
    onComplete();
  };

  const handleSave = async () => {
    setSaving(true);
    const fields: Record<string, unknown> = { healthProfilePromptDismissed: true };

    if (unitPref) fields.unitPreference = unitPref;

    if (unitPref === 'metric' && heightCm) {
      fields.heightCm = Number(heightCm);
    } else if (unitPref === 'imperial' && (heightFeet || heightInches)) {
      const cm = feetInchesToCm(Number(heightFeet) || 0, Number(heightInches) || 0);
      if (cm > 0) fields.heightCm = cm;
    }

    if (weightValue) {
      const raw = Number(weightValue);
      fields.weightKg = unitPref === 'imperial' ? lbsToKg(raw) : raw;
    }

    if (dob) fields.dateOfBirth = dob;
    if (selectedGoal) fields.workoutGoal = selectedGoal;

    try {
      await apiPut('/users/me', fields);
    } catch {
      // non-fatal
    }
    onComplete();
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-700 bg-surface p-5">
      <h2 className="mb-1 text-lg font-semibold text-white">Set up your health profile</h2>
      <p className="mb-5 text-sm text-gray-400">
        Help us personalise your experience. All health data is private.
      </p>

      {/* Unit preference */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-300">Unit Preference</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleUnitChange('metric')}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              unitPref === 'metric'
                ? 'border-primary bg-primary/20 text-primary'
                : 'border-gray-600 bg-surface-elevated text-gray-300 hover:bg-gray-700'
            }`}
          >
            Metric (kg, cm)
          </button>
          <button
            type="button"
            onClick={() => handleUnitChange('imperial')}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              unitPref === 'imperial'
                ? 'border-primary bg-primary/20 text-primary'
                : 'border-gray-600 bg-surface-elevated text-gray-300 hover:bg-gray-700'
            }`}
          >
            Imperial (lbs, ft/in)
          </button>
        </div>
      </div>

      {/* Height & Weight row */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Height</label>
          {unitPref === 'metric' ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="cm"
                min={50}
                max={300}
                className="w-full rounded-md border border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <span className="text-sm text-gray-400">cm</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={heightFeet}
                onChange={(e) => setHeightFeet(e.target.value)}
                placeholder="ft"
                min={1}
                max={9}
                className="w-16 rounded-md border border-gray-600 bg-surface-elevated px-2 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <span className="text-xs text-gray-400">ft</span>
              <input
                type="number"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
                placeholder="in"
                min={0}
                max={11}
                className="w-16 rounded-md border border-gray-600 bg-surface-elevated px-2 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <span className="text-xs text-gray-400">in</span>
            </div>
          )}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Weight</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
              placeholder={unitPref === 'imperial' ? 'lbs' : 'kg'}
              className="w-full rounded-md border border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <span className="text-sm text-gray-400">{unitPref === 'imperial' ? 'lbs' : 'kg'}</span>
          </div>
        </div>
      </div>

      {/* Date of birth */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-gray-300">Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="rounded-md border border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none [color-scheme:dark]"
        />
      </div>

      {/* Workout Goal */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-gray-300">Workout Goal</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(WORKOUT_GOAL_LABELS) as WorkoutGoal[]).map((goal) => {
            const { label, emoji } = WORKOUT_GOAL_LABELS[goal];
            const isSelected = selectedGoal === goal;
            return (
              <button
                key={goal}
                type="button"
                onClick={() => setSelectedGoal(isSelected ? null : goal)}
                className={`cursor-pointer rounded-lg border p-2.5 text-center transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/20 text-white ring-1 ring-primary'
                    : 'border-gray-600 bg-surface-elevated text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                }`}
              >
                <div className="text-xl">{emoji}</div>
                <div className="text-xs font-medium">{label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="cursor-pointer rounded-md border border-gray-600 bg-transparent px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary-gradient cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
