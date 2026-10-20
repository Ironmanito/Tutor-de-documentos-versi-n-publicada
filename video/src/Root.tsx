import React from 'react';
import { Composition } from 'remotion';
import { TutorWalkthrough } from './TutorWalkthrough';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TutorWalkthrough"
        component={TutorWalkthrough}
        durationInFrames={30 * 45} // 45 segundos a 30 fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
