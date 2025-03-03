/**
 * @author Taha Al-Jody <taha@ta3.dev>
 * https://github.com/TA3/web-user-behaviour
 */
const UserBehaviorTracker = (() => {
    const DEFAULT_CONFIG = {
        userInfo: true,
        clicks: true,
        mouseMovement: true,
        mouseMovementInterval: 1,
        mouseScroll: true,
        timeCount: true,
        clearAfterProcess: true,
        processTime: 15,
        windowResize: true,
        visibilitychange: true,
        keyboardActivity: true,
        pageNavigation: true,
        formInteractions: true,
        touchEvents: true,
        audioVideoInteraction: true,
        customEventRegistration: true,
        processData: (results) => console.log(results),
    };

    const state = {
        config: {...DEFAULT_CONFIG},
        active: false,
        listeners: new Map(),
        intervals: new Set(),
        mediaElements: new Set(),
        results: null,
        mousePosition: null,
        originalHistoryMethods: {
            pushState: history.pushState,
            replaceState: history.replaceState
        }
    };

    const resetResults = () => {
        state.results = {
            userInfo: state.config.userInfo ? {
                windowSize: [window.innerWidth, window.innerHeight],
                appCodeName: navigator.appCodeName,
                appName: navigator.appName,
                vendor: navigator.vendor,
                platform: navigator.platform,
                userAgent: navigator.userAgent
            } : null,
            time: {
                startTime: 0,
                currentTime: 0,
                stopTime: 0,
            },
            clicks: {
                clickCount: 0,
                clickDetails: []
            },
            mouseMovements: [],
            mouseScroll: [],
            keyboardActivities: [],
            navigationHistory: [],
            formInteractions: [],
            touchEvents: [],
            mediaInteractions: [],
            windowSizes: [],
            visibilityChanges: [],
            customEvents: []
        };
    };

    const getTimestamp = () => Date.now();

    const handleMouseMove = (e) => {
        state.mousePosition = [e.clientX, e.clientY, getTimestamp()];
    };

    const handleClick = (e) => {
        state.results.clicks.clickCount++;
        const path = [];
        
        e.composedPath().forEach((el, i) => {
            if (i >= e.composedPath().length - 2) return;
            
            let node = el.localName || '';
            if (el.className) node += `.${[...el.classList].join('.')}`;
            if (el.id) node += `#${el.id}`;
            path.push(node);
        });

        state.results.clicks.clickDetails.push([
            e.clientX,
            e.clientY,
            path.reverse().join(' > '),
            getTimestamp()
        ]);
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        state.results.formInteractions.push([e.target.name, getTimestamp()]);
        e.target.submit();
    };

    const patchHistoryMethods = () => {
        history.pushState = new Proxy(state.originalHistoryMethods.pushState, {
            apply: (target, thisArg, args) => {
                const result = Reflect.apply(target, thisArg, args);
                window.dispatchEvent(new Event('pushstate'));
                window.dispatchEvent(new Event('locationchange'));
                return result;
            }
        });

        history.replaceState = new Proxy(state.originalHistoryMethods.replaceState, {
            apply: (target, thisArg, args) => {
                const result = Reflect.apply(target, thisArg, args);
                window.dispatchEvent(new Event('replacestate'));
                window.dispatchEvent(new Event('locationchange'));
                return result;
            }
        });
    };

    const trackMediaElement = (element) => {
        const mediaEvents = ['play', 'pause', 'ended', 'volumechange'];
        const handler = (e) => {
            state.results.mediaInteractions.push([
                e.type,
                element.currentSrc,
                element.currentTime,
                getTimestamp()
            ]);
        };

        mediaEvents.forEach(event => {
            element.addEventListener(event, handler);
            state.mediaElements.add({ element, event, handler });
        });
    };

    return {
        config(newConfig) {
            state.config = { ...DEFAULT_CONFIG, ...newConfig };
        },

        start() {
            if (state.active) return;
            state.active = true;
            resetResults();
            state.results.time.startTime = getTimestamp();

            // Event listeners setup
            const addListener = (type, handler, options) => {
                window.addEventListener(type, handler, options);
                state.listeners.set(handler, { type, handler, options });
            };

            if (state.config.mouseMovement) {
                addListener('mousemove', handleMouseMove);
                const interval = setInterval(() => {
                    if (state.mousePosition && (!state.results.mouseMovements.length ||
                        state.mousePosition[0] !== state.results.mouseMovements.slice(-1)[0]?.[0] ||
                        state.mousePosition[1] !== state.results.mouseMovements.slice(-1)[0]?.[1])) {
                        state.results.mouseMovements.push(state.mousePosition);
                    }
                }, state.config.mouseMovementInterval * 1000);
                state.intervals.add(interval);
            }

            if (state.config.clicks) addListener('click', handleClick);
            if (state.config.mouseScroll) addListener('scroll', () => {
                state.results.mouseScroll.push([window.scrollX, window.scrollY, getTimestamp()]);
            });

            if (state.config.windowResize) addListener('resize', () => {
                state.results.windowSizes.push([window.innerWidth, window.innerHeight, getTimestamp()]);
            });

            if (state.config.visibilitychange) addListener('visibilitychange', () => {
                state.results.visibilityChanges.push([document.visibilityState, getTimestamp()]);
            });

            if (state.config.keyboardActivity) addListener('keydown', (e) => {
                state.results.keyboardActivities.push([e.key, getTimestamp()]);
            });

            if (state.config.pageNavigation) {
                patchHistoryMethods();
                const navHandler = () => {
                    state.results.navigationHistory.push([location.href, getTimestamp()]);
                };
                ['popstate', 'pushstate', 'replacestate', 'locationchange'].forEach(event => {
                    addListener(event, navHandler);
                });
            }

            if (state.config.formInteractions) {
                addListener('submit', handleFormSubmit, true);
            }

            if (state.config.touchEvents) {
                addListener('touchstart', (e) => {
                    state.results.touchEvents.push([
                        'touchstart',
                        e.touches[0].clientX,
                        e.touches[0].clientY,
                        getTimestamp()
                    ]);
                });
            }

            if (state.config.audioVideoInteraction) {
                document.querySelectorAll('video, audio').forEach(trackMediaElement);
            }

            if (state.config.processTime) {
                const interval = setInterval(() => this.processResults(), state.config.processTime * 1000);
                state.intervals.add(interval);
            }
        },

        stop() {
            if (!state.active) return;
            state.active = false;

            // Clear intervals
            state.intervals.forEach(clearInterval);
            state.intervals.clear();

            // Remove event listeners
            state.listeners.forEach(({ type, handler, options }) => {
                window.removeEventListener(type, handler, options);
            });
            state.listeners.clear();

            // Remove media listeners
            state.mediaElements.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            state.mediaElements.clear();

            // Restore original history methods
            history.pushState = state.originalHistoryMethods.pushState;
            history.replaceState = state.originalHistoryMethods.replaceState;

            state.results.time.stopTime = getTimestamp();
            this.processResults();
        },

        processResults() {
            state.results.time.currentTime = getTimestamp();
            state.config.processData({ ...state.results });
            
            if (state.config.clearAfterProcess) {
                const preservedInfo = state.config.userInfo 
                    ? { userInfo: state.results.userInfo } 
                    : {};
                resetResults();
                Object.assign(state.results, preservedInfo);
            }
        },

        registerCustomEvent(eventName, handler) {
            if (!state.config.customEventRegistration) return;
            
            const wrappedHandler = (e) => {
                state.results.customEvents.push({
                    eventName,
                    details: e.detail,
                    timestamp: getTimestamp()
                });
                handler(e);
            };
            
            window.addEventListener(eventName, wrappedHandler);
            state.listeners.set(wrappedHandler, {
                type: eventName,
                handler: wrappedHandler
            });
        },

        getResults() {
            return structuredClone(state.results);
        },

        getConfig() {
            return { ...state.config };
        }
    };
})();

// Usage example:
// UserBehaviorTracker.config({ processData: data => sendToAnalytics(data) });
// UserBehaviorTracker.start();
// UserBehaviorTracker.registerCustomEvent('customEvent', handleCustom);
