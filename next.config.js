/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config, { dev, isServer }) => {
        if (dev) {
            // Keep the proper resolution of source maps
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
