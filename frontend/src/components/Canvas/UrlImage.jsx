import React, { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';

export const UrlImage = ({ imageObj }) => {
    if (!imageObj) return null;
    return (
        <KonvaImage
            image={imageObj}
            width={imageObj.naturalWidth}
            height={imageObj.naturalHeight}
        />
    );
};
