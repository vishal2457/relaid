export const healthApi = {
	checkHealth: (apiURL: string) => {
		return fetch(`${apiURL}/api/public/v1/health/check`);
	},
};
