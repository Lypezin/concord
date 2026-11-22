import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../../lib/cn.js';

interface VolumeSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  accent?: 'primary' | 'emerald';
}

export function VolumeSlider({
  value,
  min = 0,
  max = 200,
  step = 1,
  onChange,
  className,
  accent = 'primary',
}: VolumeSliderProps) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(vals) => {
        if (typeof vals[0] === 'number') {
          onChange(vals[0]);
        }
      }}
      onDoubleClick={() => onChange(100)}
      title="Duplo clique para redefinir em 100%"
      className={cn(
        'relative flex h-5 w-full touch-none select-none items-center cursor-pointer',
        className,
      )}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/[0.12]">
        <SliderPrimitive.Range
          className={cn(
            'absolute h-full rounded-full',
            accent === 'emerald' ? 'bg-[#23a55a]' : 'bg-[#5865f2]',
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          'block h-3.5 w-3.5 rounded-full border-2 bg-white shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865f2]',
          accent === 'emerald' ? 'border-[#23a55a]' : 'border-[#5865f2]',
        )}
      />
    </SliderPrimitive.Root>
  );
}
