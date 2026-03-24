export type ApiSuccessResponse<T> = {
  code: 0;
  message: 'success';
  data: T;
};

export type ApiErrorResponse = {
  code: number;
  message: string | string[];
  data: null;
  timestamp: string;
};
