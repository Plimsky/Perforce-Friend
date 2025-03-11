/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config, { dev, isServer }) => {
        // Enable better source maps in development
        if (dev) {
            // Use source-map for better debugging
            config.devtool = "source-map";

            // Ensure proper resolution of source maps
            config.output = {
                ...config.output,
                devtoolModuleFilenameTemplate: (info) => {
                    const filename = info.absoluteResourcePath;
                    return filename;
                },
            };
        }

        return config;
    },
};

module.exports = nextConfig;
