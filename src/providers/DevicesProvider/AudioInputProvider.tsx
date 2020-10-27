// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React, {
  createContext,
  useEffect,
  useState,
  useContext,
  useMemo,
  useRef
} from 'react';
import { DeviceChangeObserver } from 'amazon-chime-sdk-js';

import { useAudioVideo } from '../AudioVideoProvider';
import { useMeetingManager } from '../MeetingProvider';
import { getFormattedDropdownDeviceOptions } from '../../utils/device-utils';
import { DeviceTypeContext, DeviceConfig } from '../../types';
import { AUDIO_INPUT } from '../../constants/additional-audio-video-devices';

const Context = createContext<DeviceTypeContext | null>(null);

const AudioInputProvider: React.FC = ({ children }) => {
  const meetingManager = useMeetingManager();
  const audioVideo = useAudioVideo();
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputDevice, setSelectedAudioInputDevice] = useState(
    meetingManager.selectedAudioInputDevice
  );
  const initialized = useRef(false);

  useEffect(() => {
    const callback = (updatedAudioInputDevice: string | null): void => {
      setSelectedAudioInputDevice(updatedAudioInputDevice);
    };
    meetingManager.subscribeToSelectedAudioInputDevice(callback);

    return (): void => {
      meetingManager.unsubscribeFromSelectedAudioInputDevice(callback);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const observer: DeviceChangeObserver = {
      audioInputsChanged: (newAudioInputs: MediaDeviceInfo[]) => {
        setAudioInputs(newAudioInputs);
      }
    };

    async function initAudioInput() {
      if (!audioVideo) {
        return;
      }

      const devices = await audioVideo.listAudioInputDevices();

      if (isMounted) {
        setAudioInputs(devices);
        audioVideo.addDeviceChangeObserver(observer);
        initialized.current = true;
      }
    }

    initAudioInput();

    return () => {
      isMounted = false;
      audioVideo?.removeDeviceChangeObserver(observer);
    };
  }, [audioVideo]);

  useEffect(() => {
    if (!audioVideo) {
      return;
    }

    const observer: DeviceChangeObserver = {
      audioInputsChanged: async (newAudioInputs: MediaDeviceInfo[]) => {

        if (!initialized.current) {
          return;
        }

        const existingDevice = newAudioInputs.find(device => device.deviceId === selectedAudioInputDevice);
        if (existingDevice) {
            const outdatedDevice = existingDevice.label !== meetingManager.selectedAudioInputDeviceLabel
              || existingDevice.deviceId !== meetingManager.selectedAudioInputDevice;

              if (outdatedDevice) {
                console.log("Stale audio input device found. Dropping and selecting audio input")

                await audioVideo.chooseAudioInputDevice(null);
                await meetingManager.selectAudioInputDevice(existingDevice.deviceId);
              }

        } else {
          await meetingManager.selectAudioInputDevice('none');
        }
      }
    };

    audioVideo.addDeviceChangeObserver(observer)

    return () => audioVideo.removeDeviceChangeObserver(observer);
  }, [audioVideo, selectedAudioInputDevice])

  const contextValue: DeviceTypeContext = useMemo(
    () => ({
      devices: audioInputs,
      selectedDevice: selectedAudioInputDevice
    }),
    [audioInputs, selectedAudioInputDevice]
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

const useAudioInputs = (props?: DeviceConfig): DeviceTypeContext => {
  const needAdditionalIO = props && props.additionalDevices;
  const context = useContext(Context);

  if (!context) {
    throw new Error('useAudioInputs must be used within AudioInputProvider');
  }

  let { devices } = context;
  const { selectedDevice } = context;

  if (needAdditionalIO) {
    const additionalAudioInputs = getFormattedDropdownDeviceOptions(
      AUDIO_INPUT
    );
    if (additionalAudioInputs !== null) {
      devices = [...devices, ...additionalAudioInputs];
    }
  }

  return { devices, selectedDevice };
};

export { AudioInputProvider, useAudioInputs };
