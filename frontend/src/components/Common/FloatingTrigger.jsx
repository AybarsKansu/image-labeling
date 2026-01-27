import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const FloatingTrigger = ({ side, isOpen, onClick }) => {
    const isLeft = side === 'left';

    return (
        <div
            onClick={onClick}
            className={`absolute top-1/2 -translate-y-1/2 z-50 
        w-6 h-24 flex items-center justify-center
        cursor-pointer transition-all duration-300
        hover:bg-accent/20 active:bg-accent/40
        ${isLeft ? 'left-0 rounded-r-lg' : 'right-0 rounded-l-lg'}
        ${!isOpen ? 'bg-accent/10' : 'bg-transparent'}
      `}
            title={`Toggle ${side} sidebar`}
        >
            {isLeft ? (
                isOpen ? <ChevronLeft className="w-4 h-4 text-accent opacity-50 hover:opacity-100" /> : <ChevronRight className="w-4 h-4 text-accent" />
            ) : (
                isOpen ? <ChevronRight className="w-4 h-4 text-accent opacity-50 hover:opacity-100" /> : <ChevronLeft className="w-4 h-4 text-accent" />
            )}
        </div>
    );
};

export default FloatingTrigger;
