const BASE_URL = '';

export const fetchTracklist = async (region) => {
  const response = await fetch(`${BASE_URL}/tracklist/${region}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch tracklist');
  }
  return response.json();
};
