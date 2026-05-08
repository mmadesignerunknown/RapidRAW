import React, { useState, useRef, useEffect, useCallback } from 'react';

interface RangeSliderProps {
  label: React.ReactNode;
  minLimit: number;
  maxLimit: number;
  min: number;
  max: number;
  defaultValue?: { min: number; max: number };
  onChange: (values: { min: number; max: number }) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  step?: number;
  suffix?: string;
  gradientColors?: string[];
  trackClassName?: string;
}

type Handle = 'min' | 'max';

const DOUBLE_CLICK_THRESHOLD_MS = 300;
const FINE_ADJUSTMENT_MULTIPLIER = 0.2;
const TOUCH_DRAG_THRESHOLD_PX = 10;

const RangeSlider: React.FC<RangeSliderProps> = ({
  label,
  minLimit,
  maxLimit,
  min: initialMin,
  max: initialMax,
  defaultValue,
  onChange,
  onDragStateChange = () => {},
  step = 1,
  suffix = '',
  gradientColors,
  trackClassName,
}) => {
  const [min, setMin] = useState(initialMin);
  const [max, setMax] = useState(initialMax);
  const [draggingHandle, setDraggingHandle] = useState<Handle | null>(null);
  const [isEditingMin, setIsEditingMin] = useState(false);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [editMinValue, setEditMinValue] = useState<string>(String(initialMin));
  const [editMaxValue, setEditMaxValue] = useState<string>(String(initialMax));
  const [isLabelHovered, setIsLabelHovered] = useState(false);
  
  const sliderRef = useRef<HTMLDivElement>(null);
  const minInputRef = useRef<HTMLInputElement | null>(null);
  const maxInputRef = useRef<HTMLInputElement | null>(null);
  const lastUpTime = useRef(0);
  const lastPointerXRef = useRef<number>(0);
  const accumulatedValueRef = useRef<number>(0);
  const dragStartValuesRef = useRef<{ min: number; max: number } | null>(null);
  const pendingTouchRef = useRef<{
    startX: number;
    startY: number;
    handle: Handle;
  } | null>(null);

  const defaultMin = defaultValue?.min ?? minLimit;
  const defaultMax = defaultValue?.max ?? maxLimit;

  const stepStr = String(step);
  const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;

  const snapToStep = useCallback(
    (val: number): number => {
      const snapped = Math.round((val - minLimit) / step) * step + minLimit;
      const clamped = Math.max(minLimit, Math.min(maxLimit, snapped));
      return parseFloat(clamped.toFixed(decimalPlaces));
    },
    [minLimit, maxLimit, step, decimalPlaces]
  );

  // Update internal state when props change
  useEffect(() => {
    setMin(initialMin);
    setMax(initialMax);
  }, [initialMin, initialMax]);

  useEffect(() => {
    onDragStateChange(draggingHandle !== null);
  }, [draggingHandle, onDragStateChange]);

  useEffect(() => {
    if (!isEditingMin) {
      setEditMinValue(String(min));
    }
  }, [min, isEditingMin]);

  useEffect(() => {
    if (!isEditingMax) {
      setEditMaxValue(String(max));
    }
  }, [max, isEditingMax]);

  useEffect(() => {
    if (isEditingMin && minInputRef.current) {
      minInputRef.current.focus();
      minInputRef.current.select();
    }
    if (isEditingMax && maxInputRef.current) {
      maxInputRef.current.focus();
      maxInputRef.current.select();
    }
  }, [isEditingMin, isEditingMax]);

  const getPercent = useCallback((value: number) => {
    return ((value - minLimit) / (maxLimit - minLimit)) * 100;
  }, [minLimit, maxLimit]);

  const handleReset = () => {
    const newMin = defaultMin;
    const newMax = defaultMax;
    setMin(newMin);
    setMax(newMax);
    onChange({ min: newMin, max: newMax });
  };

  // Wheel support with Shift key
  useEffect(() => {
    const sliderElement = sliderRef.current;
    if (!sliderElement) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey) {
        return;
      }

      event.preventDefault();
      const direction = -Math.sign(event.deltaY);
      
      // Determine which handle is closer to mouse position
      const rect = sliderElement.getBoundingClientRect();
      const mouseX = event.clientX;
      const minX = rect.left + (getPercent(min) * rect.width) / 100;
      const maxX = rect.left + (getPercent(max) * rect.width) / 100;
      
      const distToMin = Math.abs(mouseX - minX);
      const distToMax = Math.abs(mouseX - maxX);
      
      if (distToMin < distToMax) {
        const newMin = snapToStep(min + direction * step * 2);
        const clampedMin = Math.max(minLimit, Math.min(newMin, max - step));
        if (clampedMin !== min) {
          setMin(clampedMin);
          onChange({ min: clampedMin, max });
        }
      } else {
        const newMax = snapToStep(max + direction * step * 2);
        const clampedMax = Math.min(maxLimit, Math.max(newMax, min + step));
        if (clampedMax !== max) {
          setMax(clampedMax);
          onChange({ min, max: clampedMax });
        }
      }
    };

    sliderElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      sliderElement.removeEventListener('wheel', handleWheel);
    };
  }, [min, max, minLimit, maxLimit, step, snapToStep, onChange, getPercent]);

  // Drag handling
  useEffect(() => {
    if (!draggingHandle) return;

    const sliderElement = sliderRef.current;
    if (!sliderElement) return;
    const sliderWidth = sliderElement.getBoundingClientRect().width || 1;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX: number;
      let shiftKey: boolean;

      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        shiftKey = e.shiftKey || e.altKey;
        if (e.cancelable) e.preventDefault();
      } else {
        clientX = (e as MouseEvent).clientX;
        shiftKey = (e as MouseEvent).shiftKey || (e as MouseEvent).altKey;
      }

      const deltaX = clientX - lastPointerXRef.current;
      const multiplier = shiftKey ? FINE_ADJUSTMENT_MULTIPLIER : 1;
      const deltaValue = (deltaX / sliderWidth) * (maxLimit - minLimit) * multiplier;

      const prevAccumulated = accumulatedValueRef.current;
      let newValue = prevAccumulated + deltaValue;

      if (draggingHandle === 'min') {
        newValue = Math.max(minLimit, Math.min(newValue, max - step));
      } else {
        newValue = Math.max(min + step, Math.min(newValue, maxLimit));
      }

      accumulatedValueRef.current = newValue;

      const actualDeltaValue = accumulatedValueRef.current - prevAccumulated;
      if (deltaValue !== 0) {
        lastPointerXRef.current += deltaX * (actualDeltaValue / deltaValue);
      } else {
        lastPointerXRef.current = clientX;
      }

      const snappedValue = snapToStep(accumulatedValueRef.current);

      if (draggingHandle === 'min') {
        setMin(snappedValue);
        onChange({ min: snappedValue, max });
      } else {
        setMax(snappedValue);
        onChange({ min, max: snappedValue });
      }
    };

    const handlePointerUp = () => {
      lastUpTime.current = Date.now();
      setDraggingHandle(null);
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [draggingHandle, min, max, minLimit, maxLimit, step, snapToStep, onChange]);

  const handleMouseDown = (handle: Handle) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastUpTime.current < DOUBLE_CLICK_THRESHOLD_MS) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const rect = sliderRef.current?.getBoundingClientRect();
    if (rect) {
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      let rawValue = minLimit + fraction * (maxLimit - minLimit);
      
      accumulatedValueRef.current = handle === 'min' ? min : max;
      lastPointerXRef.current = e.clientX;
      dragStartValuesRef.current = { min, max };
      setDraggingHandle(handle);
    }
  };

  const handleTouchStart = (handle: Handle) => (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    e.preventDefault();

    const touch = e.touches[0];
    pendingTouchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      handle,
    };
  };

  const handleTouchMove = (handle: Handle) => (e: React.TouchEvent<HTMLDivElement>) => {
    if (draggingHandle || !pendingTouchRef.current || e.touches.length === 0) return;

    const touch = e.touches[0];
    const pendingTouch = pendingTouchRef.current;
    
    if (pendingTouch.handle !== handle) return;

    const deltaX = touch.clientX - pendingTouch.startX;
    const deltaY = touch.clientY - pendingTouch.startY;

    if (
      Math.abs(deltaY) > TOUCH_DRAG_THRESHOLD_PX &&
      Math.abs(deltaY) > Math.abs(deltaX)
    ) {
      pendingTouchRef.current = null;
      return;
    }

    if (
      Math.abs(deltaX) < TOUCH_DRAG_THRESHOLD_PX ||
      Math.abs(deltaX) < Math.abs(deltaY)
    ) {
      return;
    }

    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return;

    const fraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    let rawValue = minLimit + fraction * (maxLimit - minLimit);
    
    if (handle === 'min') {
      rawValue = Math.min(rawValue, max - step);
    } else {
      rawValue = Math.max(rawValue, min + step);
    }
    
    const snappedValue = snapToStep(rawValue);

    accumulatedValueRef.current = handle === 'min' ? min : max;
    lastPointerXRef.current = touch.clientX;
    pendingTouchRef.current = null;

    if (e.cancelable) {
      e.preventDefault();
    }

    setDraggingHandle(handle);

    if (handle === 'min') {
      setMin(snappedValue);
      onChange({ min: snappedValue, max });
    } else {
      setMax(snappedValue);
      onChange({ min, max: snappedValue });
    }
  };

  const handleTouchEnd = () => {
    pendingTouchRef.current = null;
    if (draggingHandle) {
      setDraggingHandle(null);
    }
  };

  const handleMinEditClick = () => {
    setIsEditingMin(true);
  };

  const handleMaxEditClick = () => {
    setIsEditingMax(true);
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditMinValue(e.target.value);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditMaxValue(e.target.value);
  };

  const handleMinCommit = () => {
    let newValue = parseFloat(editMinValue);
    if (isNaN(newValue)) {
      newValue = min;
    } else {
      newValue = Math.max(minLimit, Math.min(newValue, max - step));
      newValue = snapToStep(newValue);
    }
    setMin(newValue);
    onChange({ min: newValue, max });
    setIsEditingMin(false);
  };

  const handleMaxCommit = () => {
    let newValue = parseFloat(editMaxValue);
    if (isNaN(newValue)) {
      newValue = max;
    } else {
      newValue = Math.max(min + step, Math.min(newValue, maxLimit));
      newValue = snapToStep(newValue);
    }
    setMax(newValue);
    onChange({ min, max: newValue });
    setIsEditingMax(false);
  };

  const handleMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleMinCommit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setEditMinValue(String(min));
      setIsEditingMin(false);
      e.currentTarget.blur();
    }
  };

  const handleMaxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleMaxCommit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setEditMaxValue(String(max));
      setIsEditingMax(false);
      e.currentTarget.blur();
    }
  };

  const minPercent = getPercent(min);
  const maxPercent = getPercent(max);
  
  const numericMin = isNaN(Number(min)) ? 0 : Number(min);
  const numericMax = isNaN(Number(max)) ? 0 : Number(max);

  return (
    <div className="mb-4 group" ref={sliderRef}>
      <div className="flex justify-between items-center mb-1">
        <div
          className={`grid ${typeof label === 'string' ? 'cursor-pointer' : ''}`}
          onClick={typeof label === 'string' ? handleReset : undefined}
          onDoubleClick={typeof label === 'string' ? handleReset : undefined}
          onMouseEnter={typeof label === 'string' ? () => setIsLabelHovered(true) : undefined}
          onMouseLeave={typeof label === 'string' ? () => setIsLabelHovered(false) : undefined}
        >
          <span
            aria-hidden={isLabelHovered && typeof label === 'string'}
            className={`col-start-1 row-start-1 text-sm font-medium text-text-secondary select-none transition-opacity duration-200 ease-in-out ${
              isLabelHovered && typeof label === 'string' ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {label}
          </span>
          {typeof label === 'string' && (
            <span
              aria-hidden={!isLabelHovered}
              className={`col-start-1 row-start-1 text-sm font-medium text-text-primary select-none transition-opacity duration-200 ease-in-out pointer-events-none ${
                isLabelHovered ? 'opacity-100' : 'opacity-0'
              }`}
            >
              Reset
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <div className="w-12 text-right">
            {isEditingMin ? (
              <input
                ref={minInputRef}
                className="w-full text-sm text-right bg-card-active border border-gray-500 rounded-sm px-1 py-0 outline-none focus:ring-1 focus:ring-blue-500 text-text-primary"
                max={max - step}
                min={minLimit}
                onBlur={handleMinCommit}
                onChange={handleMinInputChange}
                onKeyDown={handleMinKeyDown}
                step={step}
                type="number"
                value={editMinValue}
              />
            ) : (
              <span
                className="text-sm text-text-primary w-full text-right select-none cursor-text"
                onClick={handleMinEditClick}
                onDoubleClick={handleReset}
                data-tooltip="Click to edit"
              >
                {decimalPlaces > 0 && numericMin === 0 ? '0' : numericMin.toFixed(decimalPlaces)}
                {suffix && <span className="text-[10px] align-top inline-block mt-0.5 ml-0.5">{suffix}</span>}
              </span>
            )}
          </div>
          <div className="w-12 text-right">
            {isEditingMax ? (
              <input
                ref={maxInputRef}
                className="w-full text-sm text-right bg-card-active border border-gray-500 rounded-sm px-1 py-0 outline-none focus:ring-1 focus:ring-blue-500 text-text-primary"
                max={maxLimit}
                min={min + step}
                onBlur={handleMaxCommit}
                onChange={handleMaxInputChange}
                onKeyDown={handleMaxKeyDown}
                step={step}
                type="number"
                value={editMaxValue}
              />
            ) : (
              <span
                className="text-sm text-text-primary w-full text-right select-none cursor-text"
                onClick={handleMaxEditClick}
                onDoubleClick={handleReset}
                data-tooltip="Click to edit"
              >
                {decimalPlaces > 0 && numericMax === 0 ? '0' : numericMax.toFixed(decimalPlaces)}
                {suffix && <span className="text-[10px] align-top inline-block mt-0.5 ml-0.5">{suffix}</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative w-full h-5">
        <div
          className={`absolute top-1/2 left-0 w-full h-1.5 -translate-y-1/4 rounded-full pointer-events-none ${
            trackClassName || 'bg-card-active'
          }`}
          style={{ background: gradientColors?.length ? `linear-gradient(to right, ${gradientColors.join(', ')})` : undefined }}
        />
        
        {/* Unselected range */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/4 rounded-full pointer-events-none bg-[rgba(0,0,0,0.5)]"
          style={{
            left: 0,
            width: `${minPercent}%`,
          }}
        />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/4 rounded-full pointer-events-none bg-[rgba(0,0,0,0.5)]"
          style={{
            left: `${maxPercent}%`,
            width: `${100 - maxPercent}%`,
          }}
        />
        
        {/* Selected range */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/4 rounded-full pointer-events-none bg-accent/25"
          style={{
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
          }}
        />
        
        {/* Min Handle */}
        <div
          className={`absolute top-1/2 w-4 h-4 -translate-y-1/2 -translate-x-1/2 rounded-full bg-accent border-2 border-white shadow-md cursor-pointer z-20 ${
            draggingHandle === 'min' ? 'scale-110 bg-accent-hover' : ''
          }`}
          style={{ left: `${minPercent}%` }}
          onMouseDown={handleMouseDown('min')}
          onTouchStart={handleTouchStart('min')}
          onTouchMove={handleTouchMove('min')}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
        
        {/* Max Handle */}
        <div
          className={`absolute top-1/2 w-4 h-4 -translate-y-1/2 -translate-x-1/2 rounded-full bg-accent border-2 border-white shadow-md cursor-pointer z-20 ${
            draggingHandle === 'max' ? 'scale-110 bg-accent-hover' : ''
          }`}
          style={{ left: `${maxPercent}%` }}
          onMouseDown={handleMouseDown('max')}
          onTouchStart={handleTouchStart('max')}
          onTouchMove={handleTouchMove('max')}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
