/** @type {import('next').NextConfig} */
const nextConfig = {
    productionBrowserSourceMaps: true,
    webpack: (config, { dev, isServer }) => {
        // Adjust source map generation
        // if (dev && !isServer) {
        //     config.devtool = "cheap-source-map"; // Try different source map types
        // }

        // Sometimes disabling source maps for vendor chunks can help
        config.optimization = {
            ...config.optimization,
            minimize: false, // Disable minimization in development
        };

        return config;
    },
    // Add experimental CSS optimization
    experimental: {
        optimizeCss: true,
    },
};

module.exports = nextConfig;
