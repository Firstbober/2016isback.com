const BASE_URL = '';

export const fetchTracklist = async (region) => {
  const response = await fetch(`http://localhost:5270/tracklist/${region}`);
  if (!response.ok) {
    throw new Error('Failed to fetch tracklist');
  }
  return response.json();
};
